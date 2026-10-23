import React, { Fragment, useState } from "react";
import {
  FaCalendarAlt,
  FaConciergeBell,
  FaCut,
  FaHotel,
  FaSearch,
  FaStethoscope,
} from "react-icons/fa";
import "./CustomerBookingsBoard.css";
import BookingStatusTabs from "../shared/BookingStatusTabs";
import BookingDateFilter from "../shared/BookingDateFilter";
import PaymentUploadModal from "../shared/PaymentUploadModal";
import { apiRequest } from "../../api/client";
import { showError, showReasonPrompt, showSuccess, CUSTOMER_CANCEL_REASONS } from "../../utils/alert.jsx";
import {
  CUSTOMER_BOOKING_TABS,
  CUSTOMER_DATE_PRESETS,
  CUSTOMER_STAGE_LABELS,
  getDateRange,
} from "../../utils/bookingTabs";
import { formatDateOnly } from "../../utils/date";
import { useBookingViewParams } from "../../hooks/useBookingViewParams";
import { useCustomerBookings } from "../../hooks/useCustomerBookings";

const KIND_ICON = {
  hotel: FaHotel,
  grooming: FaCut,
  vet: FaStethoscope,
  service: FaConciergeBell,
};

const PAYMENT_LABELS = {
  unpaid: "Not paid",
  pending: "Verifying payment",
  paid: "Paid",
  partial: "Partly paid",
  rejected: "Payment rejected",
  refunded: "Refunded",
};

const EMPTY_COPY = {
  all: "No bookings for this period.",
  to_approve: "No bookings waiting for approval.",
  to_pay: "No payments needed right now.",
  on_going: "Nothing in progress right now.",
  ready_to_pickup: "Nothing ready for pickup.",
  complete: "No completed bookings for this period.",
  canceled: "No cancelled bookings for this period.",
};

const formatDay = (ymd) => {
  if (!ymd) return "";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const whenText = (item) => {
  if (item.kind === "hotel") {
    if (item.check_in && item.check_out && item.check_in !== item.check_out) {
      return `${formatDay(item.check_in)} – ${formatDay(item.check_out)}`;
    }
    return formatDay(item.check_in);
  }
  return formatDay(item.date);
};

/**
 * Customer list of hotel, grooming, and vet bookings. Uses the same stage
 * model as the receptionist board; the server decides which actions a row
 * offers. Hotel-only sections (vaccination card, care logs) are passed in via
 * `renderExtra(item)`.
 */
const CustomerBookingsBoard = ({ serviceFilter = "", embedded = false, renderExtra }) => {
  const { tab: urlTab, range, setTab, setRange } = useBookingViewParams({ defaultRange: "upcoming" });
  // Older links may still carry ?tab=to_pay; that tab no longer exists, so show all.
  const tab = urlTab === "to_pay" ? "all" : urlTab;
  const { items, counts, storeToday, updatedAt, loading, error, refresh } = useCustomerBookings({ service: serviceFilter, range });
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [payment, setPayment] = useState(null);

  const today = storeToday || formatDateOnly(new Date());
  const dateRange = getDateRange(range, today);
  const keyword = search.trim().toLowerCase();

  const visible = items.filter((item) => {
    if (tab !== "all" && item.workflow_stage !== tab) return false;
    if (!keyword) return true;
    return [item.title, item.pet_name, item.veterinarian, String(item.id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  const openPayment = (item) => {
    const endpoint = item.source === "boarding"
      ? `/customer/boarding-requests/${item.id}/payment-proof`
      : `/customer/requests/${item.id}/payment-proof`;
    setPayment({
      endpoint,
      title: item.title,
      paymentStatus: item.payment_status,
      rejectionReason: item.rejection_reason || "",
      amount: item.amount_due,
    });
  };

  const cancel = async (item) => {
    const reason = await showReasonPrompt(
      "Please tell us why you're cancelling this booking.",
      "Cancel Booking",
      "Cancel Request",
      CUSTOMER_CANCEL_REASONS
    );
    if (!reason) return;
    setBusyKey(item.key);
    try {
      if (item.source === "boarding") {
        await apiRequest(`/customer/boarding-requests/${item.id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      } else {
        await apiRequest(`/customer/requests/${item.id}/cancel`, "PATCH", { reason });
      }
      showSuccess("Booking cancelled.");
      refresh();
    } catch (err) {
      showError(err.message || "Could not cancel this booking.");
    } finally {
      setBusyKey("");
    }
  };

  const renderActions = (item) => {
    const buttons = [];
    if (item.actions.includes("pay")) {
      buttons.push(
        <button key="pay" type="button" className="cbb-btn cbb-btn--primary" onClick={() => openPayment(item)}>
          {item.payment_status === "rejected" ? "Resubmit payment" : "Pay now"}
        </button>
      );
    }
    if (item.actions.includes("view_bill")) {
      buttons.push(<a key="bill" className="cbb-btn cbb-btn--primary" href="/customer/payments">View bill</a>);
    }
    if (item.actions.includes("cancel")) {
      buttons.push(
        <button key="cancel" type="button" className="cbb-btn cbb-btn--danger" disabled={busyKey === item.key} onClick={() => cancel(item)}>
          Cancel booking
        </button>
      );
    }
    return buttons;
  };

  const renderBookingLine = (item, KindIcon) => (
    <div className="cbb-booking-line">
      <span className={`cbb-kind cbb-kind--${item.kind}`}>
        <KindIcon aria-hidden="true" />
      </span>
      <div>
        <strong>{item.title}</strong>
        <span>{item.pet_name || "Pet"} · Booking #{item.id}</span>
        {item.veterinarian && <small className="cbb-vet-inline">{item.veterinarian}</small>}
        {item.amount_due > 0 && <small className="cbb-amt-inline">Due {formatPeso(item.amount_due)}</small>}
        <small className="cbb-date-inline">
          {whenText(item)}{item.time ? ` · ${item.time}` : ""}
        </small>
      </div>
    </div>
  );

  const renderStatusPills = (item) => (
    <>
      <span className={`cbb-stage cbb-stage--${item.workflow_stage}`}>
        {CUSTOMER_STAGE_LABELS[item.workflow_stage]}
      </span>
      <span className={`cbb-pay cbb-pay--inline cbb-pay--${item.payment_status}`}>
        {PAYMENT_LABELS[item.payment_status] || item.payment_status}
      </span>
      {item.rejection_reason && <small className="cbb-note">{item.rejection_reason}</small>}
    </>
  );

  return (
    <section className={`cbb-board${embedded ? " is-embedded" : ""}`} aria-label="Your bookings">
      <div className="cbb-toolbar">
        <label className="cbb-search-wrap">
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            className="cbb-search"
            placeholder="Search pet, service, or booking number..."
            aria-label="Search your bookings"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="cbb-refresh">
          <p className="cbb-updated" aria-live="polite">
            Updated {updatedAt ? updatedAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </p>
        </div>
      </div>

      <div className="cbb-stage-bar">
        <BookingStatusTabs
          tabs={CUSTOMER_BOOKING_TABS}
          active={tab}
          counts={counts}
          onChange={setTab}
          ariaLabel="Booking stages"
        />
        <BookingDateFilter
          presets={CUSTOMER_DATE_PRESETS}
          value={range}
          range={range === "all" ? null : dateRange}
          onChange={setRange}
          ariaLabel="Filter bookings by date"
        />
      </div>

      {error && (
        <div className="cbb-error" role="alert">
          <span>{error}</span>
          <button type="button" className="cbb-btn cbb-btn--ghost" onClick={refresh}>Try again</button>
        </div>
      )}

      {loading ? (
        <div className="cbb-skeletons" aria-label="Loading your bookings">
          {[0, 1, 2].map((index) => (
            <div key={index} className="cbb-skeleton" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="cbb-empty-state">
          <span className="cbb-empty-icon">
            <FaCalendarAlt aria-hidden="true" />
          </span>
          <p>{EMPTY_COPY[tab] || EMPTY_COPY.all}</p>
        </div>
      ) : (
        <>
        <div className="cbb-table-wrap">
          <table className="cbb-table">
            <caption className="cbb-sr-only">Your bookings</caption>
            <thead>
              <tr>
                <th scope="col">Booking</th>
                <th scope="col" className="cbb-cell-date">Date / stay</th>
                <th scope="col" className="cbb-col-vet">Veterinarian</th>
                <th scope="col" className="cbb-cell-pay">Payment</th>
                <th scope="col" className="cbb-cell-amount">Amount due</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const KindIcon = KIND_ICON[item.kind] || FaConciergeBell;
                const extra = renderExtra ? renderExtra(item) : null;
                const hasExtra = React.Children.toArray(extra).length > 0;
                return (
                  <Fragment key={item.key}>
                    <tr className={`cbb-row cbb-row--${item.workflow_stage}`}>
                      <td data-label="Booking" className="cbb-cell-booking">
                        {renderBookingLine(item, KindIcon)}
                      </td>
                      <td data-label="Date / stay" className="cbb-cell-date">
                        {whenText(item)}{item.time ? ` · ${item.time}` : ""}
                      </td>
                      <td data-label="Veterinarian" className="cbb-col-vet">{item.veterinarian || "—"}</td>
                      <td data-label="Payment" className="cbb-cell-pay">
                        <span className={`cbb-pay cbb-pay--${item.payment_status}`}>
                          {PAYMENT_LABELS[item.payment_status] || item.payment_status}
                        </span>
                      </td>
                      <td data-label="Amount due" className="cbb-cell-amount">
                        {item.amount_due > 0 ? formatPeso(item.amount_due) : "—"}
                      </td>
                      <td data-label="Status">
                        {renderStatusPills(item)}
                      </td>
                      <td data-label="Actions" className="cbb-cell-actions">{renderActions(item)}</td>
                    </tr>
                    {hasExtra && (
                      <tr className="cbb-extra-row">
                        <td colSpan={7}>{extra}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="cbb-cards">
          {visible.map((item) => {
            const KindIcon = KIND_ICON[item.kind] || FaConciergeBell;
            const extra = renderExtra ? renderExtra(item) : null;
            const hasExtra = React.Children.toArray(extra).length > 0;
            return (
              <article key={item.key} className={`cbb-card cbb-row--${item.workflow_stage}`}>
                <div className="cbb-card-head">{renderBookingLine(item, KindIcon)}</div>
                <dl className="cbb-card-facts">
                  <div>
                    <dt>Date / stay</dt>
                    <dd>{whenText(item)}{item.time ? ` · ${item.time}` : ""}</dd>
                  </div>
                  <div>
                    <dt>Veterinarian</dt>
                    <dd>{item.veterinarian || "—"}</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>
                      <span className={`cbb-pay cbb-pay--${item.payment_status}`}>
                        {PAYMENT_LABELS[item.payment_status] || item.payment_status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Amount due</dt>
                    <dd className="cbb-card-amount">{item.amount_due > 0 ? formatPeso(item.amount_due) : "—"}</dd>
                  </div>
                  <div className="cbb-card-facts-full">
                    <dt>Status</dt>
                    <dd>{renderStatusPills(item)}</dd>
                  </div>
                </dl>
                <div className="cbb-card-actions">{renderActions(item)}</div>
                {hasExtra && <div className="cbb-card-extra">{extra}</div>}
              </article>
            );
          })}
        </div>
        </>
      )}

      <PaymentUploadModal
        open={Boolean(payment)}
        onClose={() => setPayment(null)}
        onSuccess={refresh}
        endpoint={payment?.endpoint || ""}
        title={payment?.title || ""}
        referenceNumber=""
        paymentStatus={payment?.paymentStatus || ""}
        rejectionReason={payment?.rejectionReason || ""}
        paymentMethod="gcash"
        amount={payment?.amount}
      />
    </section>
  );
};

export default CustomerBookingsBoard;
