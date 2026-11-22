import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../context/AuthContext";
import StockApprovalQueue from "./StockApprovalQueue";
import "./StockMovement.css";

/**
 * Stock-out approval queue page for the inventory portal. Admins review
 * here (the same backend gate applies — managers review in their portal);
 * inventory staff and super receptionists see status only.
 */
const StockApprovalsPage = () => {
  const { role } = useAuth();
  const canReview = role === "admin";

  return (
    <div className="sm-page">
      <div className="sm-header">
        <div>
          <h1><FontAwesomeIcon icon={faClipboardCheck} /> Stock-Out Approvals</h1>
          <div className="sm-subtitle">
            {canReview
              ? "Review pending sensitive stock-out requests — approving deducts stock atomically."
              : "Status of your submitted stock-out requests. Only a manager or admin can approve."}
          </div>
        </div>
      </div>
      <StockApprovalQueue canReview={canReview} mineOnly={!canReview} />
    </div>
  );
};

export default StockApprovalsPage;
