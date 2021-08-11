/**
 Our syncing and listing API guarantees depend on our server being able to return documents in consistent order of insertion. This is a bit tricky to achieve in a distributed system, where multiple server processes may be writing to the database without locking coordination. So we use "ordered ID" strings, which encode a 120-bit number combining a timestamp with random bits and a sequence counter so that two servers generating IDs at exactly the same millisecond won't collide (or rather, will collide with extremely low probability).

 This is a fairly common approach in distributed stores; see [the proposed UUIDv6-8](https://www.ietf.org/id/draft-peabody-dispatch-new-uuid-format-01.html) for a draft formalization and [Twitter Snowflake](https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake) for the original inspiration.

 This approach (practically) guarantees that there will be no collisions, but in the rare event that two servers generate IDs at the very same millisecond for the same user, the client could conceivably witness a consistency violation: i.e. a client may see a write to ID tx_2 (from server 2) but miss a write at ID tx_1 (from server 1). In practice, I'm not worried about this. But we can always make this ID transactional later if it turns out to be a real issue.

 This implementation inspired by https://gist.github.com/mikelehen/3596a30bd69384624c11.

 Properties of these IDs:
 * 1. They're based on timestamp so that they sort *after* any existing ids.
 * 2. They contain 72-bits of random data after the timestamp so that IDs won't collide with other clients' IDs.
 * 3. They sort *lexicographically* (so the timestamp is converted to characters that will sort properly).
 * 4. They're monotonically increasing.  Even if you generate more than one in the same timestamp, the
 *    latter ones will sort after the former ones.  We do this by using the previous random bits
 *    but "incrementing" them by 1 (only in the case of a timestamp collision).
 *
 * n.b. We're relying on the cloud functions' clocks to be usually mostly monotonic. If you give it timestamp 5000 and then give it timestamp 1000, it will treat the latter as timestamp 5000, which will mostly work (due to the incrementing behavior), though it will lower the between-server entropy.
 */

export class OrderedIDGenerator {
  // Timestamp of last push, used to prevent local collisions if you push twice in one ms.
  private _lastTimestampMillis = 0;

  // We generate 72-bits of randomness which get turned into 12 characters and appended to the
  // timestamp to prevent collisions with other clients.  We store the last characters we
  // generated because in the event of a collision, we'll use those same characters except
  // "incremented" by one.
  private _lastRandomCharacterCodes: number[] = [];
  private _getRandom: () => number;

  constructor(getRandom = Math.random) {
    this._getRandom = getRandom;
    this._lastTimestampMillis = 0;
    this._lastRandomCharacterCodes = [];
  }

  getOrderedID(nowTimestampMillis: number = Date.now()): OrderedID {
    const timeHasIncreased = nowTimestampMillis > this._lastTimestampMillis;
    this._lastTimestampMillis = Math.max(
      nowTimestampMillis,
      this._lastTimestampMillis ?? 0,
    );

    // We'll encode the timestamp value into our ASCII-sorted base64:
    const timeStampChars = new Array<string>(8);
    let workingTimestampValue = this._lastTimestampMillis;
    for (let i = 7; i >= 0; i--) {
      timeStampChars[i] = characterSet.charAt(workingTimestampValue % 64);
      // NOTE: Can't use << here because javascript will convert to int and lose the upper bits.
      workingTimestampValue = Math.floor(workingTimestampValue / 64);
    }
    if (workingTimestampValue !== 0) {
      throw new Error("We should have converted the entire timestamp.");
    }

    // Generate the random component of the ID.
    if (timeHasIncreased) {
      for (let i = 0; i < 12; i++) {
        this._lastRandomCharacterCodes[i] = Math.floor(this._getRandom() * 64);
      }
    } else {
      // If the timestamp hasn't increased since last push, use the same random number, except incremented by 1.
      let i = 11;
      // Implement "place value": if any trailing codes are already at 63, roll them over to 0.
      for (; i >= 0 && this._lastRandomCharacterCodes[i] === 63; i--) {
        this._lastRandomCharacterCodes[i] = 0;
      }
      // Increment the final character code which wasn't at 63.
      this._lastRandomCharacterCodes[i]++;
    }

    let output = timeStampChars.join("");
    for (let i = 0; i < 12; i++) {
      output += characterSet.charAt(this._lastRandomCharacterCodes[i]);
    }
    if (output.length != 20) throw new Error("Length should be 20.");

    return output as OrderedID;
  }
}

export type OrderedID = string & { __orderedIDOpaqueType: never };

// Modeled after base64 web-safe chars, but ordered by ASCII.
const characterSet =
  "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

export function compareOrderedIDs(a: OrderedID, b: OrderedID): number {
  if (a < b) {
    return -1;
  } else if (a === b) {
    return 0;
  } else {
    return 1;
  }
}
