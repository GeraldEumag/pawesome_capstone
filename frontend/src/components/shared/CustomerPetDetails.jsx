import { parseDateOnly } from "../../utils/date";
import "./CustomerPetDetails.css";

const petBirthdate = (pet) => pet?.birthdate || pet?.birth_date || pet?.date_of_birth || "";

const ageFromBirthdate = (birthdate) => {
  if (!birthdate) return null;
  const date = parseDateOnly(birthdate) || new Date(birthdate);
  const today = new Date();
  if (Number.isNaN(date.getTime()) || date > today) return null;

  let years = today.getFullYear() - date.getFullYear();
  const monthDifference = today.getMonth() - date.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < date.getDate())) years -= 1;
  return years < 1 ? "Less than 1 year" : `${years} year${years === 1 ? "" : "s"}`;
};

export const getPetDisplayInfo = (pet) => {
  if (!pet) return null;
  const birthdate = petBirthdate(pet);
  const parsedBirthdate = birthdate ? parseDateOnly(birthdate) || new Date(birthdate) : null;
  const storedAge = pet.age !== null && pet.age !== undefined && String(pet.age).trim() !== ""
    ? Number(pet.age)
    : null;

  return {
    name: pet.name || pet.pet_name || "Unnamed Pet",
    typeOfPet: pet.species || pet.type || pet.pet_species || "Pet",
    breed: pet.breed || pet.pet_breed || "Not provided",
    gender: pet.gender || pet.sex || "Not provided",
    birthdate,
    birthdateLabel: parsedBirthdate && !Number.isNaN(parsedBirthdate.getTime())
      ? parsedBirthdate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
      : "Not provided",
    age: ageFromBirthdate(birthdate) || (
      storedAge !== null && Number.isFinite(storedAge)
        ? storedAge < 1 ? "Less than 1 year" : `${storedAge} year${storedAge === 1 ? "" : "s"}`
        : "Not provided"
    ),
    notes: pet.notes || pet.medical_notes || pet.special_needs || "No special care notes recorded.",
  };
};

const CustomerPetDetails = ({ pet }) => {
  const details = getPetDisplayInfo(pet);
  if (!details) return null;

  return (
    <section className="customer-pet-details" aria-label={`${details.name} pet details`}>
      <div className="customer-pet-details-header">
        <strong>{details.name}</strong>
        <span>Selected pet details</span>
      </div>
      <div className="customer-pet-details-grid">
        <div className="customer-pet-detail">
          <span>Type</span>
          <strong>{details.typeOfPet}</strong>
        </div>
        <div className="customer-pet-detail">
          <span>Breed</span>
          <strong>{details.breed}</strong>
        </div>
        <div className="customer-pet-detail">
          <span>Gender</span>
          <strong>{details.gender}</strong>
        </div>
        <div className="customer-pet-detail">
          <span>Age</span>
          <strong>{details.age}</strong>
        </div>
        <div className="customer-pet-detail">
          <span>Birthdate</span>
          <strong>{details.birthdateLabel}</strong>
        </div>
        <div className="customer-pet-detail customer-pet-detail-notes">
          <span>Care notes</span>
          <strong>{details.notes}</strong>
        </div>
      </div>
    </section>
  );
};

export default CustomerPetDetails;
