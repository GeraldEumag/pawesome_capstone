import CustomerBookingsBoard from "./CustomerBookingsBoard";
import "./CustomerRequestStatus.css";

const CustomerRequestStatus = ({ embedded = false }) => {
  if (embedded) {
    return (
      <div className="customer-status-page embedded">
        <CustomerBookingsBoard embedded />
      </div>
    );
  }

  return (
    <div className="customer-status-page">
      <header className="customer-status-header">
        <div>
          <h1>My Requests</h1>
          <p>Track, pay for, and manage your hotel, grooming, and vet bookings in one place.</p>
        </div>
      </header>
      <div className="customer-status-card">
        <CustomerBookingsBoard embedded />
      </div>
    </div>
  );
};

export default CustomerRequestStatus;
