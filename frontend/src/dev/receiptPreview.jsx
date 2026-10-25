import React from "react";
import ReactDOM from "react-dom/client";
import ReceiptDocument from "../components/shared/receipt/ReceiptDocument";
import { downloadReceiptPdf, createReceiptPdf } from "../utils/receiptPdf";
import "../styles/theme.css";

const options = {
  title: "Sales Invoice",
  receiptNumber: "TXN-000123",
  date: "Jun 12, 2026, 10:42 AM",
  cashier: "Maria Santos",
  customer: "Juan Dela Cruz",
  paymentMethod: "gcash",
  paymentStatus: "paid",
  referenceNumber: "GC-998877665",
  verifiedBy: "Cashier Maria",
  items: [
    { name: "Premium Dog Food 2kg", quantity: 2, unitPrice: 450, total: 900 },
    { name: "Full Grooming — Small Breed (Shih Tzu) with extra long description to test wrapping", quantity: 1, unitPrice: 650, total: 650 },
    { name: "Anti-tick Shampoo", quantity: 1, unitPrice: 280, total: 280 },
  ],
  subtotal: 1830,
  netAmount: 1633.93,
  vat: 196.07,
  discount: 0,
  total: 1830,
  amountReceived: 2000,
  change: 170,
};

const App = () => {
  const [status, setStatus] = React.useState("");
  const [pdfUrl, setPdfUrl] = React.useState("");
  React.useEffect(() => {
    createReceiptPdf(options).then(({ doc }) => {
      setPdfUrl(doc.output("bloburl"));
      setStatus("PDF generated");
    }).catch((e) => setStatus("PDF error: " + e.message));
  }, []);
  return (
    <div style={{ padding: 24, background: "#f5f5f5", minHeight: "100vh" }}>
      <h3>Online receipt (ReceiptDocument)</h3>
      <ReceiptDocument {...options} />
      <h3 style={{ marginTop: 32 }}>PDF export — {status}</h3>
      {pdfUrl && <iframe title="pdf" src={pdfUrl} style={{ width: "100%", maxWidth: 800, height: 1100, border: "1px solid #ccc" }} />}
      <button style={{ marginTop: 12 }} onClick={() => downloadReceiptPdf(options)}>Download PDF</button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
