import { useAuthenticatedImage } from "../../utils/avatar";

/**
 * <img> wrapper that resolves authenticated /api/files/* URLs to blob URLs
 * (F-09). Renders nothing while loading or if fetch fails — pair with a
 * conditional fallback (initials/icon) as callers already do.
 */
const AuthImg = ({ src, alt = "", ...rest }) => {
  const resolved = useAuthenticatedImage(src);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} {...rest} />;
};

export default AuthImg;
