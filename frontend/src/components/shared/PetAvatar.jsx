import React, { useState } from "react";
import { FaDog, FaCat, FaPaw, FaDove } from "react-icons/fa";

const AUTH_TOKEN_KEYS = ["token", "access_token", "authToken", "customerToken", "adminToken", "clientToken"];

const getToken = () => AUTH_TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);

const getImageUrl = (pet) => {
  const url = pet?.image_url || pet?.image || null;
  if (!url) return null;
  const token = getToken();
  if (token && url.startsWith("/api/")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
  return url;
};

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
  const imageUrl = getImageUrl(pet);
  const species = getPetSpecies(pet);
  const [imgError, setImgError] = useState(false);

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
