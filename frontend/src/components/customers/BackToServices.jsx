import React from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import "./BackToServices.css";

const BackToServices = () => (
  <Link to="/customer/services" className="bts-back">
    <FaArrowLeft aria-hidden="true" />
    Back to services
  </Link>
);

export default BackToServices;
