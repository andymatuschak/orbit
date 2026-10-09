#!/bin/bash
set -euo pipefail

readonly container_name="orbit-automerge-sync"
readonly data_device="/dev/disk/by-id/google-orbit-automerge-data"
readonly data_mount="/mnt/disks/orbit-automerge"
readonly docker_config="/var/lib/orbit-automerge/docker"
readonly sync_port="8787"
readonly -a load_balancer_ranges=("35.191.0.0/16" "130.211.0.0/22")
readonly metadata_reader="/usr/share/google/get_metadata_value"
image="$(${metadata_reader} attributes/orbit-image)"
readonly image
allowed_origins="$(${metadata_reader} attributes/orbit-allowed-origins)"
readonly allowed_origins
reminder_secret="$(${metadata_reader} attributes/orbit-reminder-secret 2>/dev/null || true)"
readonly reminder_secret

for _ in $(seq 1 60); do
  [[ -b "${data_device}" ]] && break
  sleep 1
done
[[ -b "${data_device}" ]]

if ! blkid "${data_device}" >/dev/null 2>&1; then
  mkfs.ext4 -F -m 0 -L orbit-automerge-data "${data_device}"
fi
install -d -m 0755 "${data_mount}"
if ! mountpoint -q "${data_mount}"; then
  mount -o defaults,discard "${data_device}" "${data_mount}"
fi
chown 65532:65532 "${data_mount}"
chmod 0700 "${data_mount}"

# Container-Optimized OS drops inbound traffic locally even after the VPC
# firewall admits it. Mirror the VPC's Google load-balancer-only policy here.
for source_range in "${load_balancer_ranges[@]}"; do
  if ! iptables -C INPUT \
    --protocol tcp \
    --source "${source_range}" \
    --dport "${sync_port}" \
    --jump ACCEPT 2>/dev/null; then
    iptables -A INPUT \
      --protocol tcp \
      --source "${source_range}" \
      --dport "${sync_port}" \
      --jump ACCEPT
  fi
done

install -d -m 0700 "${docker_config}"
printf '%s\n' \
  '{"credHelpers":{"us-central1-docker.pkg.dev":"gcr"}}' \
  > "${docker_config}/config.json"

if docker container inspect "${container_name}" >/dev/null 2>&1; then
  docker stop --time 30 "${container_name}"
  docker rm "${container_name}"
fi

image_ready=false
for _ in $(seq 1 12); do
  if DOCKER_CONFIG="${docker_config}" docker pull "${image}"; then
    image_ready=true
    break
  fi
  sleep 5
done
[[ "${image_ready}" == true ]]

DOCKER_CONFIG="${docker_config}" docker run \
  --detach \
  --name "${container_name}" \
  --restart unless-stopped \
  --network host \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 700m \
  --cpus 1 \
  --stop-timeout 30 \
  --log-driver gcplogs \
  --log-opt gcp-project=metabook-system \
  --env HOST=0.0.0.0 \
  --env PORT="${sync_port}" \
  --env GCLOUD_PROJECT=metabook-system \
  --env GOOGLE_CLOUD_PROJECT=metabook-system \
  --env ORBIT_SYNC_ALLOWED_ORIGINS="${allowed_origins}" \
  --env ORBIT_SYNC_STORAGE_ROOT=/srv/orbit-data \
  --env ORBIT_REMINDER_SECRET="${reminder_secret}" \
  --mount type=bind,source="${data_mount}",target=/srv/orbit-data \
  "${image}"
