const ROLE_LABELS = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  manager: 'Manager',
  receptionist: 'Receptionist',
  super_receptionist: 'Super Receptionist',
  cashier: 'Cashier',
  inventory: 'Inventory',
  veterinary: 'Veterinary',
  vet: 'Veterinary',
  veterinarian: 'Veterinary',
  customer: 'Customer',
};

export const formatRoleLabel = (role) => ROLE_LABELS[role] || role;

export default formatRoleLabel;
