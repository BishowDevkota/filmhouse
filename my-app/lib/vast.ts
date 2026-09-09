/**
 * Video ad (VAST) configuration for the site's built-in <video> player.
 *
 * When VAST_TAG_URL is non-empty, a pre-roll ad (Google IMA) plays before the
 * feature on every server. Our own <video> servers run it in the player; an
 * embed server's player is cross-origin and can't host an IMA ad, so there the
 * pre-roll runs in front of the iframe (<VastPreroll>) and the embed is only
 * mounted once the break ends. YouTube trailers are left alone.
 *
 * The default is ad zone #7388809 (HilltopAds). Override it per environment
 * with NEXT_PUBLIC_VAST_TAG_URL; set that variable to "" to disable pre-rolls.
 */
export const VAST_TAG_URL: string =
  process.env.NEXT_PUBLIC_VAST_TAG_URL ??
  "https://wearydouble.com/d.meFwzbd/GJN/vsZzG/Uu/EesmK9iu/ZyUQlvkYPJTSc_zNOZDHgJ4fMmDWk/tbNlz/Mq4ZOzDlgUxyMRwE";
