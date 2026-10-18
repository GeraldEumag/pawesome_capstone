import CustomerBookingsBoard from "./CustomerBookingsBoard";
import "./CustomerRequestStatus.css";

const CustomerRequestStatus = ({ embedded = false }) => (
  <div className={`customer-status-page${embedded ? " embedded" : ""}`}>
    <CustomerBookingsBoard embedded={embedded} />
  </div>
);

export default CustomerRequestStatus;
