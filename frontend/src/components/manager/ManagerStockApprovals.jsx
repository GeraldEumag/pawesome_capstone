import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import StockApprovalQueue from "../inventory/StockApprovalQueue";
import "../inventory/StockMovement.css";

/**
 * Manager view of the sensitive stock-out approval queue. Approving
 * executes the deduction exactly once (backend-enforced); rejecting
 * requires remarks. Requesters cannot approve their own requests.
 */
const ManagerStockApprovals = () => (
  <div className="sm-page">
    <div className="sm-header">
      <div>
        <h1><FontAwesomeIcon icon={faClipboardCheck} /> Stock-Out Approvals</h1>
        <div className="sm-subtitle">
          Pending sensitive stock-out requests from inventory staff — approving deducts stock atomically.
        </div>
      </div>
    </div>
    <StockApprovalQueue canReview />
  </div>
);

export default ManagerStockApprovals;
