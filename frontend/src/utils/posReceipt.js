const readAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export function normalizeAuthoritativePosReceipt(response) {
  const receipt = response?.receipt;
  const total = readAmount(receipt?.total ?? receipt?.total_amount ?? response?.transaction?.total_amount);
  const subtotal = readAmount(receipt?.subtotal);
  const vatAmount = readAmount(receipt?.breakdown?.vat_amount ?? receipt?.vat_amount ?? receipt?.tax);
  const netAmount = readAmount(receipt?.breakdown?.net_amount ?? receipt?.net_amount);

  if (!Array.isArray(receipt?.items) || receipt.items.length === 0
    || total === null || subtotal === null || vatAmount === null || netAmount === null) {
    throw new Error("The server did not return complete receipt totals. Check transaction history before retrying.");
  }

  const items = receipt.items.map((item) => {
    const quantity = readAmount(item.quantity);
    const unitPrice = readAmount(item.unit_price ?? item.price);
    const totalPrice = readAmount(item.total_price ?? item.total);
    const itemName = item.item_name ?? item.name;

    if (!itemName || quantity === null || !Number.isInteger(quantity) || quantity < 1
      || unitPrice === null || unitPrice < 0 || totalPrice === null || totalPrice < 0) {
      throw new Error("The server did not return complete receipt items. Check transaction history before retrying.");
    }

    return {
      item_name: itemName,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    };
  });

  return { receipt, total, subtotal, vatAmount, netAmount, items };
}
