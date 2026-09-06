/**
 * Video ad (VAST) configuration for the site's built-in <video> player.
 *
 * When VAST_TAG_URL is non-empty, a pre-roll ad (Google IMA) plays before the
 * site's own <video> content — i.e. HLS and direct-file servers rendered by
 * <VastPlayer>. Embed/iframe servers and YouTube trailers can't run these
 * ads, because their players live in a different origin.
 *
 * The default is ad zone #7388809 (HilltopAds). Override it per environment
 * with NEXT_PUBLIC_VAST_TAG_URL; set that variable to "" to disable pre-rolls.
 */
export const VAST_TAG_URL: string =
  process.env.NEXT_PUBLIC_VAST_TAG_URL ??
  "https://wearydouble.com/d.meFwzbd/GJN/vsZzG/Uu/EesmK9iu/ZyUQlvkYPJTSc_zNOZDHgJ4fMmDWk/tbNlz/Mq4ZOzDlgUxyMRwE";
