import { useEffect, useState } from "react";
import { FaDog, FaCat, FaPaw, FaDove } from "react-icons/fa";
import { getAuthenticatedFileUrl } from "../../api/client";

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "";

export const resolveImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;

  if (url.startsWith("/")) {
    const origin = API_BASE_URL
      ? API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "")
      : window.location.origin;
    return `${origin}${url}`;
  }

  return url;
};

const getImageUrl = (pet) => pet?.image_url || pet?.image || null;

const getSpeciesIcon = (species) => {
  const value = String(species || "").toLowerCase();
  if (value.includes("dog")) return <FaDog />;
  if (value.includes("cat")) return <FaCat />;
  if (value.includes("rabbit")) return <FaPaw />;
  if (value.includes("bird")) return <FaDove />;
  return <FaPaw />;
};

const getPetSpecies = (pet) =>
  pet?.species || pet?.type || pet?.pet_species || "Pet";

const PetAvatar = ({ pet, size = 48, className = "" }) => {
  const imageSource = getImageUrl(pet);
  const [imageUrl, setImageUrl] = useState(null);
  const species = getPetSpecies(pet);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let blobUrl = null;

    setImgError(false);
    setImageUrl(null);
    if (!imageSource) return undefined;

    if (imageSource.includes("/api/files/pet-photos/")) {
      getAuthenticatedFileUrl(imageSource)
        .then((url) => {
          blobUrl = url;
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setImageUrl(url);
        })
        .catch(() => {
          if (!cancelled) setImgError(true);
        });
    } else {
      setImageUrl(resolveImageUrl(imageSource));
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [imageSource]);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={pet?.name || "Pet"}
        className={`pet-avatar-img ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`pet-avatar-icon ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f8",
        color: "#4a6fa5",
        fontSize: size * 0.5,
      }}
    >
      {getSpeciesIcon(species)}
    </span>
  );
};

export default PetAvatar;
