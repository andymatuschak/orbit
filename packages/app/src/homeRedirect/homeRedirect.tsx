import { useRouter } from "expo-router";

// Expo Router doesn't support platform extensions in its page-based routing. Instead, we have to support some non-route component which has the extensions.
// https://docs.expo.dev/router/advanced/platform-specific-modules/#platform-specific-extensions
export default function Page() {
  const router = useRouter();
  router.push("/review");
}
