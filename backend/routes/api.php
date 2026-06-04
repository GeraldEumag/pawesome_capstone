<?php

use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\ServiceController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\CustomersController;
use App\Http\Controllers\Admin\ChatbotController;
use App\Http\Controllers\Admin\ChatbotFaqController;
use App\Http\Controllers\Admin\ReportsController;
use App\Http\Controllers\Admin\CustomerReportController;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\LoginLogController;
use App\Http\Controllers\Admin\SalaryController;
use App\Http\Controllers\Admin\SupplierController;
use App\Http\Controllers\ChatbotController as SharedChatbotController;
use App\Http\Controllers\ChatbotWorkflowController;
use App\Http\Controllers\Customer\PortalController;
use App\Http\Controllers\Customer\CustomerStoreController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Cashier\DashboardController as CashierDashboardController;
use App\Http\Controllers\Cashier\POSController;
use App\Http\Controllers\Inventory\DashboardController as InventoryDashboardController;
use App\Http\Controllers\Manager\DashboardController as ManagerDashboardController;
use App\Http\Controllers\Receptionist\DashboardController as ReceptionistDashboardController;
use App\Http\Controllers\Receptionist\CustomerOrderController as ReceptionistCustomerOrderController;
use App\Http\Controllers\Receptionist\ServiceController as ReceptionistServiceController;
use App\Http\Controllers\Receptionist\HotelRoomController as ReceptionistHotelRoomController;
use App\Http\Controllers\Receptionist\BoardingRoomController as ReceptionistBoardingRoomController;
use App\Http\Controllers\Veterinary\DashboardController as VeterinaryDashboardController;
use App\Http\Controllers\Veterinary\MedicalRecordController;
use App\Http\Controllers\Veterinary\ConsultationWorkflowController;
use App\Http\Controllers\MedicalConfinementController;
use App\Http\Controllers\Manager\WorkflowReportController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\BoardingController;
use App\Http\Controllers\BoardingRoomController;
use App\Http\Controllers\HotelRoomController;
use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AttendanceRecordController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\Api\PayrollController as ApiPayrollController;
use App\Http\Controllers\GiftCardController;
use App\Http\Controllers\GroomingController;
use App\Http\Controllers\Api\AvailabilityController;
use App\Http\Controllers\Api\GroomingController as ApiGroomingController;
use App\Http\Controllers\PetController;
use App\Http\Controllers\VetController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\CashierPaymentController;
use App\Http\Controllers\Api\ServiceBillingController;
use App\Http\Controllers\Api\ServiceRequestController;
use App\Http\Controllers\Api\ReceptionistCustomerController;
use App\Http\Controllers\Api\SecureFileController;
use App\Http\Controllers\Api\ReceptionistPetController;
use App\Http\Controllers\ReceptionistRequestController;
use App\Http\Controllers\SystemSettingController;
use Illuminate\Support\Facades\Route;

// Global route patterns to ensure ID parameters are numeric
Route::pattern('id', '[0-9]+');
Route::pattern('pet', '[0-9]+');

// Health check endpoint for deployment monitoring
Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

// Public system settings (no auth — needed before login for theme init)
Route::get('/settings/public', [SystemSettingController::class, 'getPublicSettings']);

// Admin-only theme setting
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->group(function () {
    Route::post('/admin/settings/theme', [SystemSettingController::class, 'updateThemeColor']);
});

// Service Request API endpoints — ALL handled by ReceptionistRequestController
Route::middleware(['auth.api', 'throttle:api', 'role:cashier,veterinary,receptionist,admin,inventory'])->prefix('billing')->group(function () {
    Route::get('/inventory-items', [ServiceBillingController::class, 'getInventoryItems']);
    Route::get('/{serviceType}/{serviceId}/summary', [ServiceBillingController::class, 'getServiceSummary']);
    Route::get('/{serviceType}/{serviceId}/completion-status', [ServiceBillingController::class, 'checkCompletionStatus']);
    Route::post('/{serviceType}/{serviceId}/finalize-bill', [ServiceBillingController::class, 'finalizeBill']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:veterinary,receptionist,admin'])->prefix('billing')->group(function () {
    Route::post('/items', [ServiceBillingController::class, 'addBillingItem']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:cashier,admin'])->prefix('billing')->group(function () {
    Route::get('/unpaid-services', [ServiceBillingController::class, 'getUnpaidServices']);
    Route::patch('/items/mark-paid', [ServiceBillingController::class, 'markItemsAsPaid']);
});

Route::prefix('auth')->group(function () {
    Route::middleware('throttle:auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login']);
        Route::post('password/forgot', [AuthController::class, 'forgotPassword']);
        Route::post('password/reset', [AuthController::class, 'resetPassword']);
    });

    Route::middleware(['auth.api', 'throttle:api'])->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::put('profile', [AuthController::class, 'updateProfile']);
        Route::post('profile-photo', [AuthController::class, 'uploadProfilePhoto']);
        Route::post('change-password', [AuthController::class, 'changePassword']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin')->group(function () {
    Route::get('dashboard', [DashboardController::class, 'overview']);
    Route::get('system-health', [DashboardController::class, 'systemHealth']);

    Route::get('users', [UserController::class, 'index']);
    Route::post('users', [UserController::class, 'store']);
    Route::put('users/{id}', [UserController::class, 'update']);
    Route::patch('users/{id}/toggle', [UserController::class, 'toggle']);
    Route::delete('users/{id}', [UserController::class, 'destroy']);

    Route::get('services', [ServiceController::class, 'index']);
    Route::post('services', [ServiceController::class, 'store']);
    Route::put('services/{id}', [ServiceController::class, 'update']);
    Route::delete('services/{id}', [ServiceController::class, 'destroy']);

    // Inventory Management (Admin Routes)
    Route::get('inventory', [InventoryController::class, 'index']);
    Route::get('inventory/items', [InventoryController::class, 'index']); // Frontend compatibility
    Route::post('inventory', [InventoryController::class, 'store']);
    Route::post('inventory/items', [InventoryController::class, 'store']); // Frontend compatibility
    Route::get('inventory/{id}', [InventoryController::class, 'show']);
    Route::get('inventory/items/{id}', [InventoryController::class, 'show']); // Frontend compatibility
    Route::put('inventory/{id}', [InventoryController::class, 'update']);
    Route::put('inventory/items/{id}', [InventoryController::class, 'update']); // Frontend compatibility
    Route::post('inventory/items/{id}', [InventoryController::class, 'update']); // Multipart file workaround
    Route::delete('inventory/{id}', [InventoryController::class, 'destroy']);
    Route::delete('inventory/items/{id}', [InventoryController::class, 'destroy']); // Frontend compatibility
    Route::post('inventory/{id}/archive', [InventoryController::class, 'archive']); // Archive with reason
    Route::get('inventory/archived', [InventoryController::class, 'archived']); // Get archived items
    Route::post('inventory/{id}/unarchive', [InventoryController::class, 'unarchive']); // Unarchive item
    Route::post('inventory/{id}/adjust-stock', [InventoryController::class, 'adjustStock']);
    Route::post('inventory/items/{id}/adjust', [InventoryController::class, 'adjustStock']); // Frontend compatibility
    Route::patch('inventory/{id}/stock', [InventoryController::class, 'updateStock']); // Simple stock update
    Route::post('inventory/{id}/stock', [InventoryController::class, 'updateStock']); // CORS workaround - same as PATCH
    Route::get('inventory/{id}/history', [InventoryController::class, 'stockHistory']);
    Route::get('inventory/items/{id}/logs', [InventoryController::class, 'stockHistory']);
    Route::get('inventory/history', [InventoryController::class, 'getHistory']); // Frontend compatibility
    Route::get('inventory/low-stock', [InventoryController::class, 'lowStock']);
    Route::get('inventory/out-of-stock', [InventoryController::class, 'outOfStock']);
    Route::get('inventory/summary', [InventoryController::class, 'summary']);
    Route::get('inventory/dashboard', [InventoryController::class, 'summary']); // Frontend compatibility
    Route::get('inventory/expiry-alerts', [InventoryController::class, 'expiryAlerts']);
    Route::get('inventory/reports', [InventoryController::class, 'index']); // Frontend compatibility
    Route::get('inventory/monthly-audit', [InventoryController::class, 'getMonthlyAuditItems']);
    Route::post('inventory/monthly-audit', [InventoryController::class, 'saveMonthlyAudit']);

    // Batch Management Routes (FEFO/FIFO)
    Route::get('inventory/items/{id}/batches', [InventoryController::class, 'getItemBatches']);
    Route::post('inventory/items/{id}/batches', [InventoryController::class, 'addBatch']);
    Route::post('inventory/batches/{batchId}/dispose', [InventoryController::class, 'disposeBatch']);
    Route::post('inventory/batches/{batchId}/adjust', [InventoryController::class, 'adjustBatch']);

    Route::get('customers', [CustomersController::class, 'index']);
    Route::post('customers', [CustomersController::class, 'store']);
    Route::get('customers/{id}', [CustomersController::class, 'show']);
    Route::put('customers/{id}', [CustomersController::class, 'update']);
    Route::delete('customers/{id}', [CustomersController::class, 'destroy']);
    Route::get('customers/{id}/pets', [CustomersController::class, 'pets']);
    Route::post('customers/{id}/pets', [CustomersController::class, 'addPet']);
    Route::get('customers/search', [CustomersController::class, 'search']);
    Route::get('customers/{id}/purchases', [CustomersController::class, 'purchases']);

    Route::get('chatbot/logs', [ChatbotController::class, 'index']);
    Route::get('chatbot/logs/user/{user}', [ChatbotController::class, 'userHistory']);
    Route::get('chatbot/faqs', [ChatbotFaqController::class, 'index']);
    Route::post('chatbot/faqs', [ChatbotFaqController::class, 'store']);
    Route::put('chatbot/faqs/{faq}', [ChatbotFaqController::class, 'update']);
    Route::delete('chatbot/faqs/{faq}', [ChatbotFaqController::class, 'destroy']);

    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('reports/summary', [ReportsController::class, 'summary']);
    Route::get('reports/sales', [ReportsController::class, 'sales']);
    Route::get('reports/overview', [ReportsController::class, 'overview']);
    Route::get('reports/cashier', [ReportsController::class, 'cashier']);
    Route::get('reports/inventory', [ReportsController::class, 'inventory']);
    Route::get('reports/manager', [ReportsController::class, 'manager']);
    Route::get('reports/veterinary', [ReportsController::class, 'veterinary']);
    Route::get('reports/customers', [CustomerReportController::class, 'getCustomerReports']);
    Route::get('reports/customers/export', [CustomerReportController::class, 'exportCustomerReports']);
    Route::get('reports/customers/export-pdf', [CustomerReportController::class, 'exportCustomerReportsPdf']);
    Route::get('reports/payments', [ReportsController::class, 'payments']);
    Route::get('reports/orders', [ReportsController::class, 'orders']);
    Route::get('reports/services', [ReportsController::class, 'serviceRequests']);
    Route::get('reports/service-requests', [ReportsController::class, 'serviceRequests']);
    Route::get('reports/system-health', [ReportsController::class, 'systemHealth']);
    Route::get('reports/logistics', [ReportsController::class, 'logistics']);
    Route::get('reports/reception', [ReportsController::class, 'reception']);

    // Advanced Reporting APIs
    Route::get('reports/executive', [ReportsController::class, 'executiveOverview']);
    Route::get('reports/customers/segments', [ReportsController::class, 'customerSegmentation']);
    Route::get('reports/comparison', [ReportsController::class, 'comparativeReporting']);
    Route::get('reports/sales-analysis', [ReportsController::class, 'salesAnalysis']);
    Route::get('reports/staff-performance', [ReportsController::class, 'staffPerformance']);

    // Supplier Management
    Route::get('suppliers', [SupplierController::class, 'index']);
    Route::post('suppliers', [SupplierController::class, 'store']);
    Route::get('suppliers/{id}', [SupplierController::class, 'show']);
    Route::put('suppliers/{id}', [SupplierController::class, 'update']);
    Route::delete('suppliers/{id}', [SupplierController::class, 'destroy']);

    // Inventory Cost Report
    Route::get('inventory/cost-report', [InventoryController::class, 'costReport']);

    // Login Log Routes
    Route::get('login-logs', [LoginLogController::class, 'index']);
    Route::get('login-logs/statistics', [LoginLogController::class, 'statistics']);
    Route::get('login-logs/recent', [LoginLogController::class, 'recent']);
    Route::get('login-logs/user/{userId}', [LoginLogController::class, 'userLogs']);

    // Activity Log Routes
    Route::get('activity-logs', [ActivityLogController::class, 'index']);
    Route::get('activity-logs/statistics', [ActivityLogController::class, 'statistics']);
    Route::get('activity-logs/filters', [ActivityLogController::class, 'filters']);
    Route::get('activity-logs/{id}', [ActivityLogController::class, 'show']);
    Route::get('activity-logs/user/{userId}', [ActivityLogController::class, 'userLogs']);

    // Appointments overview (for History.jsx admin history view)
    Route::get('appointments', [AppointmentController::class, 'index']);

    // Dynamic routes with ID parameters
    Route::get('customers/{id}', [CustomersController::class, 'show']);
    Route::get('customers/{id}/pets', [CustomersController::class, 'pets']);
    Route::get('customers/{id}/purchases', [CustomersController::class, 'purchases']);
    Route::get('reports/customers/{id}', [CustomerReportController::class, 'getCustomerDetail']);
});

// Veterinary Services Management
Route::middleware(['auth.api', 'throttle:api', 'role:veterinary'])->prefix('admin')->group(function () {
    Route::get('services', [ServiceController::class, 'index']);
    Route::post('services', [ServiceController::class, 'store']);
    Route::put('services/{id}', [ServiceController::class, 'update']);
    Route::delete('services/{id}', [ServiceController::class, 'destroy']);
});

Route::middleware(['auth.api', 'throttle:api'])->prefix('chatbot')->group(function () {
    Route::get('welcome', [SharedChatbotController::class, 'welcome']);
    Route::post('message', [SharedChatbotController::class, 'message']);
    Route::get('workflow/booking-options', [ChatbotWorkflowController::class, 'bookingOptions']);
    Route::post('workflow/bookings', [ChatbotWorkflowController::class, 'createBooking']);
    Route::post('workflow/appointments/lookup', [ChatbotWorkflowController::class, 'lookupAppointments']);
    Route::post('workflow/inventory/search', [ChatbotWorkflowController::class, 'searchInventory']);
    // Hotel booking workflow routes
    Route::get('workflow/hotel-options', [ChatbotWorkflowController::class, 'hotelOptions']);
    Route::get('workflow/hotel/availability', [ChatbotWorkflowController::class, 'checkHotelAvailability']);
    Route::post('workflow/hotel-bookings', [ChatbotWorkflowController::class, 'createHotelBooking']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:customer'])->prefix('customer')->group(function () {
    Route::get('overview', [PortalController::class, 'overview']);
    Route::get('dashboard', [PortalController::class, 'overview']);
    Route::get('appointments', [PortalController::class, 'appointments']);
    Route::get('bookings', [PortalController::class, 'bookings']);
    Route::get('transactions', [PortalController::class, 'transactions']);
    Route::get('purchases', [PortalController::class, 'purchases']);
    Route::post('appointments', [PortalController::class, 'bookAppointment']);
    Route::get('boardings', [BoardingController::class, 'index']);
    Route::post('boardings', [BoardingController::class, 'store']);
    Route::get('services', [PortalController::class, 'services']);
    Route::post('chatbot', [PortalController::class, 'chatbot']);

    // Customer History Routes
    Route::get('orders/history', [PortalController::class, 'transactions']);
    Route::get('requests/history', [ServiceRequestController::class, 'customerRequests']);
    Route::get('payments/history', [PortalController::class, 'transactions']);
    
    // Customer Service Requests
    Route::post('requests', [ServiceRequestController::class, 'store']);
    Route::get('my-requests', [ServiceRequestController::class, 'customerRequests']);
    Route::patch('requests/{id}/cancel', [ServiceRequestController::class, 'cancel']);
    Route::post('requests/{id}/payment-proof', [ServiceRequestController::class, 'uploadPaymentProof']);
    Route::get('requests/{id}/receipt', [ServiceRequestController::class, 'receipt']);
    
    // Customer Store Checkout
    Route::post('store/checkout', [CustomerStoreController::class, 'checkout']);
    Route::get('store/orders', [CustomerStoreController::class, 'orders']);
    Route::get('store/orders/{id}', [CustomerStoreController::class, 'orders']);
    Route::post('store/orders/{id}/payment-proof', [CustomerStoreController::class, 'uploadPaymentProof']);
    Route::get('store/orders/{id}/receipt', [CustomerStoreController::class, 'receipt']);
    Route::post('store/orders/{id}/cancel', [CustomerStoreController::class, 'cancel']);

    Route::get('reports/orders', [CustomerStoreController::class, 'orders']);
    Route::get('reports/payments', [PortalController::class, 'transactions']);
    Route::get('reports/services', [ServiceRequestController::class, 'customerRequests']);
    Route::get('reports/appointments', [PortalController::class, 'appointments']);
    Route::get('reports/boarding', [BoardingController::class, 'index']);
    Route::get('reports/confinements', [MedicalConfinementController::class, 'index']);
    Route::get('reports/receipts', [PortalController::class, 'transactions']);
    
    // Customer Medical History (Read-only for own pets)
    Route::get('pets/{pet}/medical-history', [MedicalRecordController::class, 'indexByCustomer']);

    Route::get('boarding-requests', [BoardingController::class, 'index']);
    Route::post('boarding-requests', [BoardingController::class, 'store']);
    Route::get('boardings/available-rooms', [BoardingController::class, 'availableRooms']);
    Route::get('boardings/{id}', [BoardingController::class, 'show']);
    Route::post('boardings/{id}/cancel', [BoardingController::class, 'cancel']);
    Route::get('boarding-requests/{id}', [BoardingController::class, 'show']);
    Route::post('boarding-requests/{id}/cancel', [BoardingController::class, 'cancel']);
    Route::post('boarding-requests/{id}/payment-proof', [BoardingController::class, 'uploadPaymentProof']);
    Route::get('boarding-requests/{id}/care-logs', [BoardingController::class, 'careLogs']);

    Route::get('vet-consultations', [VetController::class, 'index']);
    Route::post('vet-consultations', [VetController::class, 'store']);
    Route::get('vet-consultations/{id}', [VetController::class, 'show']);
    Route::get('medical-confinements', [MedicalConfinementController::class, 'index']);
    Route::get('medical-confinements/{id}', [MedicalConfinementController::class, 'show']);
    Route::post('medical-confinements/{id}/payment-proof', [MedicalConfinementController::class, 'uploadPaymentProof']);
    Route::get('medical-confinements/{id}/care-logs', [MedicalConfinementController::class, 'careLogs']);
    Route::get('medical-confinements/{id}/medical-notes', [MedicalConfinementController::class, 'progressNotes']);

    // Availability Checking Endpoints
    Route::prefix('availability')->group(function () {
        Route::get('veterinary', [AvailabilityController::class, 'veterinary']);
        Route::get('grooming', [AvailabilityController::class, 'grooming']);
        Route::get('boarding', [AvailabilityController::class, 'boarding']);
        Route::post('check/veterinary-slot', [AvailabilityController::class, 'checkVeterinarySlot']);
        Route::post('check/grooming-date', [AvailabilityController::class, 'checkGroomingDate']);
        Route::post('check/boarding-room', [AvailabilityController::class, 'checkBoardingRoom']);
    });
});

Route::middleware(['auth.api', 'throttle:api', 'role:cashier'])->prefix('cashier')->group(function () {
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('dashboard', [CashierDashboardController::class, 'overview']);
    Route::get('dashboard/overview', [CashierDashboardController::class, 'overviewWrapped']);
    Route::get('sales', [CashierDashboardController::class, 'sales']);
    Route::get('transactions', [CashierDashboardController::class, 'transactions']);
    Route::get('history', [CashierDashboardController::class, 'history']);
    Route::get('transactions/search', [CashierDashboardController::class, 'searchTransactions']);
    Route::get('payment-requests', [CashierDashboardController::class, 'getPaymentRequests']);
    Route::get('payments', [CashierPaymentController::class, 'index']);
    
    // Reports static routes
    Route::get('reports/live', [ReportsController::class, 'cashier']);
    Route::get('reports/overview', [ReportsController::class, 'cashier']);
    Route::get('reports/pending-payments', [ReportsController::class, 'payments']);
    Route::get('reports/paid-payments', [ReportsController::class, 'payments']);
    Route::get('reports/rejected-payments', [ReportsController::class, 'payments']);
    Route::get('reports/pos-sales', [ReportsController::class, 'sales']);
    Route::get('reports/receipts', [ReportsController::class, 'payments']);
    Route::get('reports/payment-methods', [ReportsController::class, 'cashier']);
    Route::get('boarding-payments/pending', [CashierDashboardController::class, 'getPaymentRequests']);
    Route::get('confinement-payments/pending', [CashierDashboardController::class, 'getPaymentRequests']);
    
    // POS static routes
    Route::get('inventory/sellable', [POSController::class, 'getProducts']);
    Route::get('pos/products', [POSController::class, 'getProducts']);
    Route::get('pos/services', [POSController::class, 'getServices']);
    Route::get('pos/transactions', [POSController::class, 'getTransactions']);
    
    // Cashier Transaction Operations
    Route::post('refund', [CashierDashboardController::class, 'refund']);
    Route::post('multi-payment', [CashierDashboardController::class, 'multiPayment']);
    Route::post('apply-discount', [CashierDashboardController::class, 'applyDiscount']);
    Route::post('handover', [CashierDashboardController::class, 'handover']);
    Route::get('handover/last', [CashierDashboardController::class, 'getLastHandover']);
    Route::post('end-shift', [CashierDashboardController::class, 'endShift']);
    Route::get('shift-report/last', [CashierDashboardController::class, 'getLastShiftReport']);
    Route::post('void', [CashierDashboardController::class, 'voidTransaction']);
    
    // POS Operations
    Route::post('pos/transaction', [POSController::class, 'processTransaction']);
    
    // Dynamic routes with ID parameters
    Route::get('receipt/{id}', [CashierDashboardController::class, 'generateReceipt']);
    Route::get('customer-order-receipts/{id}', [CashierDashboardController::class, 'customerOrderReceipt']);
    Route::get('pos/transaction/{id}', [POSController::class, 'getTransaction']);
    Route::get('pos/invoice/{id}', [POSController::class, 'downloadInvoice']);
    
    // Payment Verification Routes
    Route::post('payment-requests/{id}/verify', [CashierDashboardController::class, 'verifyPayment']);
    Route::post('payment-requests/{id}/reject', [CashierDashboardController::class, 'rejectPayment']);
    
    // Existing Payment Verification Routes
    Route::put('payments/{id}/{type}/verify', [CashierPaymentController::class, 'verify']);
    Route::put('payments/{id}/{type}/reject', [CashierPaymentController::class, 'reject']);
    
    // Boarding/Confinement Payment Routes
    Route::post('boarding-payments/{id}/verify', [CashierDashboardController::class, 'verifyPayment'])->defaults('type', 'boarding');
    Route::post('boarding-payments/{id}/reject', [CashierDashboardController::class, 'rejectPayment'])->defaults('type', 'boarding');
    Route::post('confinement-payments/{id}/verify', [CashierDashboardController::class, 'verifyPayment'])->defaults('type', 'medical_confinement');
    Route::post('confinement-payments/{id}/reject', [CashierDashboardController::class, 'rejectPayment'])->defaults('type', 'medical_confinement');
    
    // POS Transaction Actions
    Route::post('pos/transaction/{id}/void', [POSController::class, 'voidTransaction']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:receptionist'])->prefix('receptionist')->group(function () {
    Route::get('dashboard', [ReceptionistDashboardController::class, 'overview']);
    Route::get('appointments', [ReceptionistDashboardController::class, 'appointments']);
    Route::get('customers', [ReceptionistDashboardController::class, 'customers']);
    Route::post('customers', [ReceptionistCustomerController::class, 'store']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('appointment/list', [AppointmentController::class, 'index']);
    Route::get('veterinarians/available', [AppointmentController::class, 'availableVeterinarians']);
    Route::get('customer-orders/pending', [ReceptionistCustomerOrderController::class, 'pending']);
    Route::get('orders/approval-history', [ReceptionistCustomerOrderController::class, 'approvalHistory']);
    Route::get('requests/pending', [ReceptionistRequestController::class, 'pending']);
    Route::get('requests/approval-history', [ReceptionistRequestController::class, 'approvalHistory']);
    Route::get('requests/rejected-history', [ReceptionistRequestController::class, 'rejectedHistory']);
    Route::get('scheduling/history', [ReceptionistRequestController::class, 'schedulingHistory']);
    Route::get('boarding-requests/pending', [BoardingController::class, 'pending']);
    Route::get('medical-confinements/pending-admission', [MedicalConfinementController::class, 'pendingAdmission']);
    Route::get('boarding/inventory-items', [BoardingController::class, 'getAvailableInventoryItems']);
    Route::get('boarding-rooms', [HotelRoomController::class, 'index']);
    
    // Reports static routes
    Route::get('reports/transactions', [CashierDashboardController::class, 'transactions']);
    Route::get('reports/live', [ReportsController::class, 'reception']);
    Route::get('reports/overview', [ReportsController::class, 'reception']);
    Route::get('reports/customer-orders', [ReportsController::class, 'orders']);
    Route::get('reports/service-requests', [ReportsController::class, 'serviceRequests']);
    Route::get('reports/appointments', [ReportsController::class, 'veterinary']);
    
    // Customer Order Management
    Route::get('customer-orders', [ReceptionistCustomerOrderController::class, 'index']);
    
    // Customer Order actions
    Route::get('customer-orders/{id}', [ReceptionistCustomerOrderController::class, 'show']);
    Route::post('customer-orders/{id}/approve', [ReceptionistCustomerOrderController::class, 'approve']);
    Route::post('customer-orders/{id}/reject', [ReceptionistCustomerOrderController::class, 'reject']);
    Route::post('customer-orders/{id}/cancel', [ReceptionistCustomerOrderController::class, 'cancel']);
    
    // Pet Management
    Route::get('pets', [\App\Http\Controllers\Api\ReceptionistPetController::class, 'index']);
    Route::post('pets', [\App\Http\Controllers\Api\ReceptionistPetController::class, 'store']);
    
    // Service Request Management
    Route::get('requests', [ReceptionistRequestController::class, 'index']);
    Route::post('requests', [ReceptionistRequestController::class, 'store']);
    Route::patch('requests/{id}/status', [ReceptionistRequestController::class, 'updateStatus']);
    
    // Boarding Requests
    Route::get('boarding-requests', [BoardingController::class, 'index']);
    
    // Medical Confinements
    Route::get('medical-confinements', [MedicalConfinementController::class, 'index']);
    
    // Dynamic routes with ID parameters
    Route::put('orders/{id}/status', [ReceptionistDashboardController::class, 'updateOrderStatus']);
    
    // Appointment management
    Route::post('appointments', [AppointmentController::class, 'store']);
    Route::get('appointments/{id}', [AppointmentController::class, 'show']);
    Route::put('appointments/{id}', [AppointmentController::class, 'update']);
    Route::post('appointments/{id}/approve', [AppointmentController::class, 'approve']);
    Route::post('appointments/{id}/reject', [AppointmentController::class, 'reject']);
    Route::post('appointments/{id}/reschedule', [AppointmentController::class, 'reschedule']);
    Route::post('appointments/{id}/cancel', [AppointmentController::class, 'cancel']);
    Route::get('veterinarians/{id}/schedule', [AppointmentController::class, 'veterinarianSchedule']);
    
    // Service Request actions
    Route::post('requests/{id}/approve', [ReceptionistRequestController::class, 'approve']);
    Route::post('requests/{id}/reject', [ReceptionistRequestController::class, 'reject']);
    
    // Boarding Request actions
    Route::post('boarding-requests/{id}/approve', [BoardingController::class, 'approve']);
    Route::post('boarding-requests/{id}/reject', [BoardingController::class, 'reject']);
    Route::post('boarding-requests/{id}/verify-vaccination', [BoardingController::class, 'verifyVaccinationCard']);
    Route::post('boarding-requests/{id}/schedule', [BoardingController::class, 'schedule']);
    Route::post('boarding-requests/{id}/check-in', [BoardingController::class, 'checkIn']);
    Route::post('boarding-requests/{id}/care-logs', [BoardingController::class, 'addCareLog']);
    Route::get('boarding-requests/{id}/care-logs', [BoardingController::class, 'careLogs']);
    Route::post('boarding-requests/{id}/ready-for-pickup', [BoardingController::class, 'readyForPickup']);
    Route::post('boarding-requests/{id}/check-out', [BoardingController::class, 'checkOut']);
    
    // Service & Room Management
    Route::get('services', [ReceptionistServiceController::class, 'index']);
    Route::post('services', [ReceptionistServiceController::class, 'store']);
    Route::put('services/{id}', [ReceptionistServiceController::class, 'update']);
    Route::delete('services/{id}', [ReceptionistServiceController::class, 'destroy']);

    Route::get('hotel-rooms', [ReceptionistHotelRoomController::class, 'index']);
    Route::post('hotel-rooms', [ReceptionistHotelRoomController::class, 'store']);
    Route::put('hotel-rooms/{id}', [ReceptionistHotelRoomController::class, 'update']);
    Route::delete('hotel-rooms/{id}', [ReceptionistHotelRoomController::class, 'destroy']);

    Route::get('boarding-rooms', [ReceptionistBoardingRoomController::class, 'index']);
    Route::post('boarding-rooms', [ReceptionistBoardingRoomController::class, 'store']);
    Route::put('boarding-rooms/{id}', [ReceptionistBoardingRoomController::class, 'update']);
    Route::delete('boarding-rooms/{id}', [ReceptionistBoardingRoomController::class, 'destroy']);

    // Boarding Inventory Usage Routes
    Route::post('boarding-requests/{id}/inventory-usage', [BoardingController::class, 'recordInventoryUsage']);
    Route::get('boarding-requests/{id}/inventory-usage-history', [BoardingController::class, 'getInventoryUsageHistory']);
    
    // Medical Confinement actions
    Route::post('medical-confinements/{id}/assign-room', [MedicalConfinementController::class, 'assignRoom']);
    Route::post('medical-confinements/{id}/admit', [MedicalConfinementController::class, 'admit']);
    Route::post('medical-confinements/{id}/care-logs', [MedicalConfinementController::class, 'addCareLog']);
    Route::get('medical-confinements/{id}/care-logs', [MedicalConfinementController::class, 'careLogs']);
    Route::post('medical-confinements/{id}/release', [MedicalConfinementController::class, 'release']);
});

Route::middleware(['auth.api', 'throttle:api'])->get('inventory/public/items', [InventoryDashboardController::class, 'publicItems']);

Route::middleware(['auth.api', 'throttle:api', 'role:admin,inventory'])->prefix('inventory')->group(function () {
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('dashboard', [InventoryDashboardController::class, 'overview']);
    Route::get('dashboard/overview', [InventoryDashboardController::class, 'dashboardOverview']);
    Route::get('dashboard/low-stock', [InventoryDashboardController::class, 'lowStockDashboard']);
    Route::get('dashboard/recent-activity', [InventoryDashboardController::class, 'recentActivity']);
    Route::get('logs', [InventoryDashboardController::class, 'logs']);
    Route::get('history', [InventoryDashboardController::class, 'history']);
    Route::get('stock/history', [InventoryDashboardController::class, 'history']);
    Route::get('low-stock', [InventoryDashboardController::class, 'lowStock']);
    Route::get('expiry-alerts', [InventoryDashboardController::class, 'expiryAlerts']);
    Route::get('monthly-audit', [InventoryDashboardController::class, 'monthlyAudit']);
    Route::get('monthly-audit-report', [InventoryDashboardController::class, 'monthlyAuditReport']);
    Route::get('audit-analytics', [InventoryDashboardController::class, 'auditAnalytics']);
    Route::get('monthly-audit/discrepancy-reasons', [InventoryDashboardController::class, 'discrepancyReasons']);
    Route::post('reorder-requests', [InventoryDashboardController::class, 'reorderRequest']);
    
    // Reports static routes
    Route::get('reports', [InventoryDashboardController::class, 'reports']);
    Route::get('reports/live', [ReportsController::class, 'inventory']);
    Route::get('reports/overview', [ReportsController::class, 'inventory']);
    Route::get('reports/stock-levels', [ReportsController::class, 'inventory']);
    Route::get('reports/low-stock', [ReportsController::class, 'inventory']);
    Route::get('reports/movements', [ReportsController::class, 'inventory']);
    Route::get('reports/adjustments', [ReportsController::class, 'inventory']);
    Route::get('reports/pos-deductions', [ReportsController::class, 'inventory']);
    Route::get('reports/order-deductions', [ReportsController::class, 'inventory']);
    Route::get('reports/stock-restores', [ReportsController::class, 'inventory']);
    Route::get('reports/valuation', [ReportsController::class, 'inventory']);
    
    // Items collection routes
    Route::get('items', [InventoryDashboardController::class, 'items']);
    Route::get('items/archived', [InventoryController::class, 'archived']);
    Route::post('items', [InventoryDashboardController::class, 'storeItem']);
    Route::post('monthly-audit', [InventoryDashboardController::class, 'saveMonthlyAudit']);
    
    // Dynamic routes with ID parameters
    Route::get('items/{id}', [InventoryDashboardController::class, 'showItem']);
    Route::put('items/{id}', [InventoryDashboardController::class, 'updateItem']);
    Route::post('items/{id}', [InventoryDashboardController::class, 'updateItem']); // Multipart file workaround
    Route::delete('items/{id}', [InventoryDashboardController::class, 'destroyItem']);
    Route::patch('items/{id}/archive', [InventoryController::class, 'archive']);
    Route::patch('items/{id}/restore', [InventoryController::class, 'unarchive']);
    Route::post('items/{id}/adjust-stock', [InventoryController::class, 'adjustStock']);
    Route::get('items/{id}/batches', [InventoryController::class, 'getItemBatches']);
    Route::post('items/{id}/batches', [InventoryController::class, 'addBatch']);
    Route::put('batches/{batchId}', [InventoryController::class, 'adjustBatch']);
    Route::post('{id}/stock', [InventoryDashboardController::class, 'adjustStock']);
    Route::patch('{id}/stock', [InventoryDashboardController::class, 'adjustStock']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:manager'])->prefix('manager')->group(function () {
    Route::get('dashboard', [ManagerDashboardController::class, 'overview']);
    Route::get('staff', [ManagerDashboardController::class, 'staff']);
    Route::get('executive-summary', [ManagerDashboardController::class, 'executiveSummary']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('reports/summary', [ReportsController::class, 'summary']);
    Route::get('reports/overview', [ReportsController::class, 'manager']);
    Route::get('reports/sales', [ReportsController::class, 'sales']);
    Route::get('reports/live', [ReportsController::class, 'manager']);
    Route::get('reports/payments', [ReportsController::class, 'payments']);
    Route::get('reports/customers', [ReportsController::class, 'customers']);
    Route::get('reports/services', [ReportsController::class, 'serviceRequests']);
    Route::get('reports/inventory', [ReportsController::class, 'inventory']);
    Route::get('reports/staff-performance', [ReportsController::class, 'manager']);
    Route::get('reports/revenue-trends', [ReportsController::class, 'sales']);
    Route::get('reports/boarding', [WorkflowReportController::class, 'boarding']);
    Route::get('reports/medical-confinement', [WorkflowReportController::class, 'medicalConfinement']);
    Route::get('reports/room-occupancy', [WorkflowReportController::class, 'roomOccupancy']);
    Route::get('reports/veterinary-services', [WorkflowReportController::class, 'veterinaryServices']);
    Route::get('reports/attendance', [ReportsController::class, 'managerAttendance']);
    Route::get('reports/payroll', [ReportsController::class, 'managerPayroll']);

    // Manager Attendance Routes
    Route::get('attendance', [AttendanceController::class, 'index']);
    Route::post('attendance/{id}/remarks', [AttendanceController::class, 'update']);
    Route::post('attendance/{id}/review', [AttendanceController::class, 'update']);

    // Manager Payroll Routes
    Route::get('payroll', [ApiPayrollController::class, 'index']);
    Route::post('payroll', [ApiPayrollController::class, 'store']);
    Route::post('payroll/compute', [ApiPayrollController::class, 'compute']);
    Route::post('payroll/generate', [ApiPayrollController::class, 'generate']);
    Route::post('payroll/{id}/approve', [ApiPayrollController::class, 'approve']);
    Route::post('payroll/{id}/release', [ApiPayrollController::class, 'markAsPaid']);

    // Manager History Route
    Route::get('history', [ManagerDashboardController::class, 'history']);

    // Manager Leave Routes
    Route::get('leaves', [\App\Http\Controllers\Manager\LeaveController::class, 'index']);
    Route::post('leaves', [\App\Http\Controllers\Manager\LeaveController::class, 'store']);
    Route::post('leaves/{id}/approve', [\App\Http\Controllers\Manager\LeaveController::class, 'approve']);
    Route::post('leaves/{id}/reject', [\App\Http\Controllers\Manager\LeaveController::class, 'reject']);
    Route::get('leaves/calendar', [\App\Http\Controllers\Manager\LeaveController::class, 'calendar']);

    // Manager Schedule Routes
    Route::get('schedules', [\App\Http\Controllers\Manager\ScheduleController::class, 'index']);
    Route::post('schedules', [\App\Http\Controllers\Manager\ScheduleController::class, 'store']);
    Route::delete('schedules/{id}', [\App\Http\Controllers\Manager\ScheduleController::class, 'destroy']);

    // Manager Fingerprint / Biometric Attendance Routes
    Route::prefix('biometric')->group(function () {
        Route::post('challenge', [\App\Http\Controllers\Manager\FingerprintController::class, 'registerChallenge']);
        Route::post('register', [\App\Http\Controllers\Manager\FingerprintController::class, 'registerCredential']);
        Route::post('auth-challenge', [\App\Http\Controllers\Manager\FingerprintController::class, 'verifyChallenge']);
        Route::post('verify-punch', [\App\Http\Controllers\Manager\FingerprintController::class, 'verifyAndPunch']);
        Route::post('terminal-punch', [\App\Http\Controllers\Manager\FingerprintController::class, 'terminalPunch']);
        Route::get('credentials', [\App\Http\Controllers\Manager\FingerprintController::class, 'listCredentials']);
        Route::delete('credentials/{credential}', [\App\Http\Controllers\Manager\FingerprintController::class, 'deleteCredential']);
        Route::get('today-summary', [\App\Http\Controllers\Manager\FingerprintController::class, 'todaySummary']);
    });

    // Manager Staff-Specific Routes
    Route::get('staff/{id}/attendance', [AttendanceController::class, 'index']);
    Route::get('staff/{id}/payroll', [ApiPayrollController::class, 'index']);
});

// Payroll Routes (Admin access)
Route::middleware(['auth.api', 'throttle:api', 'role:admin,manager'])->prefix('payroll')->group(function () {
    Route::get('/', [ApiPayrollController::class, 'index']);
    Route::post('/generate', [ApiPayrollController::class, 'generate']);
    Route::get('/reports/overview', [ReportsController::class, 'payrollReports']);
    Route::post('/{id}/approve', [ApiPayrollController::class, 'approve']);
    Route::post('/{id}/release', [ApiPayrollController::class, 'markAsPaid']);
    Route::get('/{id}', [ApiPayrollController::class, 'show']);
});

// Attendance Routes (Admin and Manager)
Route::middleware(['auth.api', 'throttle:api', 'role:admin,manager'])->prefix('attendance')->group(function () {
    Route::get('/', [AttendanceController::class, 'index']);
    Route::post('/', [AttendanceController::class, 'store']);
    Route::get('/today', [AttendanceController::class, 'today']);
    Route::get('/statistics', [AttendanceController::class, 'statistics']);
    Route::get('/export', [AttendanceController::class, 'export']);
    Route::get('/{id}', [AttendanceController::class, 'show']);
    Route::put('/{id}', [AttendanceController::class, 'update']);
    Route::delete('/{id}', [AttendanceController::class, 'destroy']);
});

// Manager Attendance Records Routes (Simple attendance tracking)
Route::middleware(['auth.api', 'throttle:api', 'role:admin,manager'])->prefix('attendance-records')->group(function () {
    Route::get('/', [AttendanceRecordController::class, 'index']);
    Route::post('/', [AttendanceRecordController::class, 'store']);
    Route::get('/summary', [AttendanceRecordController::class, 'summary']);
});

// Payroll Routes (Admin and Payroll only) - Temporarily commented due to autoloader issue
// Route::middleware(['auth.api', 'throttle:api', 'role:admin,payroll'])->prefix('payroll')->group(function () {
//     Route::get('/', [Api\PayrollController::class, 'index']);
//     Route::post('/generate', [Api\PayrollController::class, 'generate']);
//     Route::get('/summary', [Api\PayrollController::class, 'summary']);
//     Route::post('/{id}/process', [Api\PayrollController::class, 'processPayment']);
//     Route::get('/{id}/payslip', [Api\PayrollController::class, 'payslip']);
//     Route::get('/{payroll}', [Api\PayrollController::class, 'show']);
//     Route::patch('/{payroll}/approve', [Api\PayrollController::class, 'approve']);
//     Route::patch('/{payroll}/paid', [Api\PayrollController::class, 'markAsPaid']);
//     Route::delete('/{payroll}', [Api\PayrollController::class, 'destroy']);
//
//     // Legacy routes using main controller
//     Route::post('/', [PayrollController::class, 'store']);
//     Route::put('/{id}', [PayrollController::class, 'update']);
//     Route::get('/reports/overview', [ReportsController::class, 'payrollReports']);
//     Route::get('/reports/attendance', [ReportsController::class, 'payrollReports']);
//     Route::get('/reports/salaries', [ReportsController::class, 'payrollReports']);
//     Route::get('/reports/payroll-history', [ReportsController::class, 'payrollReports']);
// });

// Admin Salaries Routes (for EmployeeSalaryManagement component)
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin/salaries')->group(function () {
    Route::get('/', [SalaryController::class, 'index']);
    Route::post('/', [SalaryController::class, 'store']);
    Route::put('/{id}', [SalaryController::class, 'update']);
    Route::delete('/{id}', [SalaryController::class, 'destroy']);
});


// Employee self-service routes
Route::middleware(['auth.api', 'throttle:api'])->group(function () {
    Route::post('/attendance/check-in', [AttendanceController::class, 'checkIn']);
    Route::post('/attendance/check-out', [AttendanceController::class, 'checkOut']);
    Route::get('/my-payroll', [PayrollController::class, 'myPayroll']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:veterinary,vet'])->prefix('veterinary')->group(function () {
    Route::get('dashboard', [VeterinaryDashboardController::class, 'overview']);
    Route::get('appointments', [VeterinaryDashboardController::class, 'appointments']);
    Route::post('appointments', [AppointmentController::class, 'store']);
    Route::get('patients', [VeterinaryDashboardController::class, 'patients']);
    Route::get('history', [VeterinaryDashboardController::class, 'history']);
    Route::get('reports', [VeterinaryDashboardController::class, 'reports']);
    Route::get('receipt/{id}', [VeterinaryDashboardController::class, 'receipt']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('consultations', [ConsultationWorkflowController::class, 'index']);
    Route::get('consultations/scheduled', [ConsultationWorkflowController::class, 'scheduled']);
    Route::get('medical-confinements', [MedicalConfinementController::class, 'index']);
    Route::get('inventory-items', [MedicalRecordController::class, 'getAvailableItems']);
    
    // Reports static routes
    Route::get('reports/live', [ReportsController::class, 'veterinary']);
    Route::get('reports/overview', [ReportsController::class, 'veterinary']);
    Route::get('reports/appointments', [ReportsController::class, 'veterinary']);
    Route::get('reports/consultations', [ReportsController::class, 'veterinary']);
    Route::get('reports/treatments', [ReportsController::class, 'veterinary']);
    Route::get('reports/medical-records', [ReportsController::class, 'veterinary']);
    Route::get('reports/confinements', [ReportsController::class, 'veterinary']);
    Route::get('reports/health-alerts', [ReportsController::class, 'veterinary']);
    Route::get('reports/completed-services', [ReportsController::class, 'veterinary']);
    
    // Dynamic routes with ID parameters
    Route::get('appointments/{id}', [VeterinaryDashboardController::class, 'appointment']);
    Route::put('appointments/{id}', [AppointmentController::class, 'update']);
    
    // Veterinarian appointment actions
    Route::post('appointments/{id}/start', [AppointmentController::class, 'start']);
    Route::post('appointments/{id}/complete', [AppointmentController::class, 'complete']);
    Route::put('appointments/{id}/medical', [AppointmentController::class, 'updateMedical']);
    Route::match(['put', 'patch'], 'appointments/{id}/status', [AppointmentController::class, 'updateStatus']);
    
    // Consultation actions
    Route::post('consultations/{id}/start', [ConsultationWorkflowController::class, 'start']);
    Route::post('consultations/{id}/complete', [ConsultationWorkflowController::class, 'complete']);
    Route::post('consultations/{id}/recommend-confinement', [ConsultationWorkflowController::class, 'recommendConfinement']);
    
    // Medical Confinement actions
    Route::post('medical-confinements/{id}/progress-notes', [MedicalConfinementController::class, 'addProgressNote']);
    Route::get('medical-confinements/{id}/progress-notes', [MedicalConfinementController::class, 'progressNotes']);
    Route::post('medical-confinements/{id}/mark-under-observation', [MedicalConfinementController::class, 'markUnderObservation']);
    Route::post('medical-confinements/{id}/mark-under-treatment', [MedicalConfinementController::class, 'markUnderTreatment']);
    Route::post('medical-confinements/{id}/clear-for-discharge', [MedicalConfinementController::class, 'clearForDischarge']);
    
    // Medical Records Management
    Route::get('medical-records', [MedicalRecordController::class, 'index']);
    Route::post('medical-records', [MedicalRecordController::class, 'store']);
    Route::get('medical-records/{id}', [MedicalRecordController::class, 'show']);
    Route::put('medical-records/{id}', [MedicalRecordController::class, 'update']);
    Route::delete('medical-records/{id}', [MedicalRecordController::class, 'destroy']);
    Route::post('medical-records/{id}/lock', [MedicalRecordController::class, 'lock']);
    
    // Veterinary Inventory Usage Routes
    Route::post('appointments/{id}/inventory-usage', [MedicalRecordController::class, 'recordInventoryUsage']);
    Route::get('appointments/{id}/inventory-usage', [MedicalRecordController::class, 'getUsageHistory']);
    Route::get('appointments/{id}/inventory-usage-history', [MedicalRecordController::class, 'getUsageHistory']);
    Route::post('appointments/{serviceId}/finalize-bill', [ServiceBillingController::class, 'finalizeBill'])
        ->defaults('serviceType', 'veterinary');
    
    // Pet-specific medical data
    Route::get('pets/{petId}/medical-records', [MedicalRecordController::class, 'forPet']);
    Route::get('pets/{pet}/medical-history', [MedicalRecordController::class, 'indexByPet']);
    Route::post('pets/{pet}/medical-history', [MedicalRecordController::class, 'storeForPet']);
    Route::get('pets/{petId}/vaccinations', [MedicalRecordController::class, 'petVaccinations']);
    Route::post('pets/{petId}/vaccinations', [MedicalRecordController::class, 'createVaccination']);
    
    // Customers Access for Appointments
    Route::get('customers', [CustomersController::class, 'index']);
    Route::get('customers/search', [CustomersController::class, 'search']);
    Route::get('customers/{id}', [CustomersController::class, 'show']);
    Route::get('customers/{id}/pets', [CustomersController::class, 'pets']);
});

// Public Inventory Read Routes (available to all users for store/pos)
Route::middleware('throttle:api')->prefix('inventory')->group(function () {
    Route::get('/public/items', [InventoryDashboardController::class, 'publicItems']);
    Route::get('/public/categories', [InventoryDashboardController::class, 'categories']);
    Route::get('/public/item/{id}', [InventoryDashboardController::class, 'showPublicItem']);
    Route::get('/sellable', [InventoryController::class, 'sellable']); // For POS and Customer Store (public access)
});

// Product Search Routes (for Cashier POS)
Route::middleware(['auth.api', 'throttle:api'])->prefix('products')->group(function () {
    Route::get('/search', [InventoryDashboardController::class, 'searchProducts']);
    Route::get('/barcode/{barcode}', [InventoryDashboardController::class, 'lookupBarcode']);
});

// Gift Card Routes (for Cashier POS)
Route::middleware(['auth.api', 'throttle:api'])->prefix('gift-cards')->group(function () {
    Route::get('/{number}/balance', [GiftCardController::class, 'checkBalance']);
});

// Notification Routes (available to all authenticated users)
Route::middleware(['auth.api', 'throttle:api'])->prefix('notifications')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread', [NotificationController::class, 'getUnread']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/mark-all-read', [NotificationController::class, 'markAllAsRead']);
    Route::post('/clear-all', [NotificationController::class, 'clearAll']);
    Route::delete('/{id}', [NotificationController::class, 'destroy']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('notifications')->group(function () {
    Route::post('/', [NotificationController::class, 'store']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:cashier'])->group(function () {
    Route::get('/customers/search', [CustomersController::class, 'search']);
    Route::post('/customers', [CustomersController::class, 'store']);
    Route::get('/customers/{id}/purchases', [CustomersController::class, 'purchases']);
    Route::get('/pos/items', [POSController::class, 'getProducts']);
    Route::post('/appointments/{id}/pay', [AppointmentController::class, 'markAsPaid']);
});

// Admin Customer View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin/customers')->group(function () {
    Route::get('/', [CustomersController::class, 'index']);
    Route::get('/search', [CustomersController::class, 'search']);
    Route::get('/{id}', [CustomersController::class, 'show']);
    Route::get('/{id}/purchases', [CustomersController::class, 'purchases']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:receptionist,admin,manager'])->post('/notifications/booking-status', [NotificationController::class, 'bookingStatus']);

// Hotel Room Management Routes (Admin/Receptionist)
Route::middleware(['auth.api', 'throttle:api', 'role:admin,receptionist'])->prefix('hotel-rooms')->group(function () {
    Route::get('/', [HotelRoomController::class, 'index']);
    Route::post('/', [HotelRoomController::class, 'store']);
    Route::get('/{id}', [HotelRoomController::class, 'show']);
    Route::put('/{id}', [HotelRoomController::class, 'update']);
    Route::delete('/{id}', [HotelRoomController::class, 'destroy']);
    Route::post('/{id}/status', [HotelRoomController::class, 'setStatus']);
});

// Manager Hotel Room View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:manager'])->prefix('manager/hotel-rooms')->group(function () {
    Route::get('/', [HotelRoomController::class, 'index']);
    Route::get('/{id}', [HotelRoomController::class, 'show']);
});

// Boarding/Hotel Reservation Routes (Receptionist only)
Route::middleware(['auth.api', 'throttle:api', 'role:receptionist'])->prefix('boardings')->group(function () {
    Route::get('/', [BoardingController::class, 'index']);
    Route::post('/', [BoardingController::class, 'store']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('/available-rooms', [BoardingController::class, 'availableRooms']);
    
    // Dynamic routes with ID parameters
    Route::get('/{id}', [BoardingController::class, 'show']);
    Route::put('/{id}', [BoardingController::class, 'update']);
    Route::post('/{id}/check-in', [BoardingController::class, 'checkIn']);
    Route::post('/{id}/check-out', [BoardingController::class, 'checkOut']);
    Route::post('/{id}/checkout', [BoardingController::class, 'checkOut']);
    Route::post('/{id}/complete', [BoardingController::class, 'complete']);
    Route::post('/{id}/finalize-bill', [BoardingController::class, 'finalizeBill']);
    Route::post('/{id}/cancel', [BoardingController::class, 'cancel']);
    Route::post('/{id}/pay', [BoardingController::class, 'markAsPaid']);
    Route::post('/{boarding}/payment', [PaymentController::class, 'storeBoardingPayment']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:receptionist,admin'])->prefix('boarding')->group(function () {
    Route::post('/{id}/check-in', [BoardingController::class, 'checkIn']);
    Route::post('/{id}/checkout', [BoardingController::class, 'checkOut']);
    Route::post('/{id}/check-out', [BoardingController::class, 'checkOut']);
    Route::post('/{id}/complete', [BoardingController::class, 'complete']);
    Route::post('/{id}/finalize-bill', [BoardingController::class, 'finalizeBill']);
    Route::post('/{id}/inventory-usage', [BoardingController::class, 'recordInventoryUsage']);
    Route::get('/{id}/inventory-usage-history', [BoardingController::class, 'getInventoryUsageHistory']);
    Route::get('/inventory-items', [BoardingController::class, 'getAvailableInventoryItems']);
});

// Admin Boarding View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin/boardings')->group(function () {
    Route::get('/', [BoardingController::class, 'index']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('/available-rooms', [BoardingController::class, 'availableRooms']);
    
    // Dynamic routes with ID parameters
    Route::get('/{id}', [BoardingController::class, 'show']);
});

// Vet Boarding Routes (View current boarders for emergency access)
Route::middleware(['auth.api', 'throttle:api', 'role:veterinary'])->prefix('veterinary/boardings')->group(function () {
    Route::get('/current-boarders', [BoardingController::class, 'currentBoarders']);
    Route::get('/{id}', [BoardingController::class, 'show']);
});

// Grooming Appointment Routes (Receptionist only)
Route::middleware(['auth.api', 'throttle:api', 'role:receptionist'])->prefix('grooming')->group(function () {
    Route::get('/', [\App\Http\Controllers\Api\GroomingController::class, 'index']);
    Route::post('/', [\App\Http\Controllers\Api\GroomingController::class, 'store']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('/inventory-items', [\App\Http\Controllers\Api\GroomingController::class, 'getAvailableInventoryItems']);
    
    // Dynamic routes with ID parameters
    Route::put('/{grooming}/status', [\App\Http\Controllers\Api\GroomingController::class, 'updateStatus']);
    Route::get('/{id}', [\App\Http\Controllers\Api\GroomingController::class, 'show']);
    Route::put('/{id}', [\App\Http\Controllers\Api\GroomingController::class, 'update']);
    Route::delete('/{id}', [\App\Http\Controllers\Api\GroomingController::class, 'destroy']);
    
    // Grooming Inventory Usage Routes
    Route::post('/{id}/inventory-usage', [\App\Http\Controllers\Api\GroomingController::class, 'recordInventoryUsage']);
    Route::get('/{id}/inventory-usage-history', [\App\Http\Controllers\Api\GroomingController::class, 'getInventoryUsageHistory']);
    Route::post('/{id}/finalize-bill', [\App\Http\Controllers\Api\GroomingController::class, 'finalizeBill']);
    Route::post('/{id}/complete', [\App\Http\Controllers\Api\GroomingController::class, 'complete']);
});

// Admin Grooming View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin/grooming')->group(function () {
    Route::get('/', [\App\Http\Controllers\Api\GroomingController::class, 'index']);
    Route::get('/{id}', [\App\Http\Controllers\Api\GroomingController::class, 'show']);
});

// Customer Grooming Routes (View own appointments, create new)
Route::middleware(['auth.api', 'throttle:api', 'role:customer'])->prefix('customer/grooming')->group(function () {
    Route::get('/', [GroomingController::class, 'index']);
    Route::post('/', [GroomingController::class, 'store']);
    Route::get('/{id}', [GroomingController::class, 'show']);
});

// Vet Appointment Routes (Receptionist only)
Route::middleware(['auth.api', 'throttle:api', 'role:receptionist'])->prefix('vet')->group(function () {
    Route::get('/', [VetController::class, 'index']);
    Route::post('/', [VetController::class, 'store']);
    Route::get('/{id}', [VetController::class, 'show']);
    Route::patch('/{id}/status', [VetController::class, 'updateStatus']);
    Route::delete('/{id}', [VetController::class, 'destroy']);
});

// Admin Vet View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:admin'])->prefix('admin/vet')->group(function () {
    Route::get('/', [VetController::class, 'index']);
    Route::get('/{id}', [VetController::class, 'show']);
});

// Manager Vet View-Only Routes
Route::middleware(['auth.api', 'throttle:api', 'role:manager'])->prefix('manager/vet')->group(function () {
    Route::get('/', [VetController::class, 'index']);
    Route::get('/{id}', [VetController::class, 'show']);
});

// Customer Pets Routes (View own pets, create new)
Route::middleware(['auth.api', 'throttle:api', 'role:customer'])->prefix('customer/pets')->group(function () {
    Route::get('/', [PetController::class, 'index']);
    Route::post('/', [PetController::class, 'store']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('/archived', [PetController::class, 'archived']);
    
    // Dynamic routes with ID parameters
    Route::get('/{id}', [PetController::class, 'show'])->whereNumber('id');
    Route::put('/{id}', [PetController::class, 'update'])->whereNumber('id');
    Route::delete('/{id}', [PetController::class, 'destroy'])->whereNumber('id');
    Route::post('/{id}/archive', [PetController::class, 'archive'])->whereNumber('id');
    Route::post('/{id}/unarchive', [PetController::class, 'unarchive'])->whereNumber('id');
});

// Customer Vet Routes (View own appointments, create new)
Route::middleware(['auth.api', 'throttle:api', 'role:customer'])->prefix('customer/vet')->group(function () {
    Route::get('/', [VetController::class, 'index']);
    Route::post('/', [VetController::class, 'store']);
    Route::get('/{id}', [VetController::class, 'show']);
});

// Pets Routes (Receptionist, Admin, Manager, Customer)
Route::middleware(['auth.api', 'throttle:api', 'role:receptionist,admin,manager,customer'])->prefix('pets')->group(function () {
    Route::get('/', [PetController::class, 'index']);
    Route::post('/', [PetController::class, 'store']);
    
    // IMPORTANT: Static routes must come before dynamic routes
    Route::get('/archived', [PetController::class, 'archived']);
    Route::get('/pets/archived', [PetController::class, 'archived']); // Frontend compatibility
    
    // Dynamic routes with ID parameters
    Route::get('/{id}', [PetController::class, 'show'])->whereNumber('id');
    Route::put('/{id}', [PetController::class, 'update'])->whereNumber('id');
    Route::delete('/{id}', [PetController::class, 'destroy'])->whereNumber('id');
    Route::post('/{id}/archive', [PetController::class, 'archive'])->whereNumber('id');
    Route::post('/{id}/unarchive', [PetController::class, 'unarchive'])->whereNumber('id');
});

// Legacy Route Aliases (for backward compatibility with tests)
Route::middleware(['auth.api', 'throttle:api', 'role:receptionist,admin'])->group(function () {
    // Legacy appointments endpoint (alias to receptionist appointments)
    Route::get('/appointments', [AppointmentController::class, 'index']);
    Route::post('/appointments', [AppointmentController::class, 'store']);
    
    // Public appointment status update endpoint
    Route::patch('/appointments/{id}/status', [AppointmentController::class, 'updateStatus']);
    Route::put('/appointments/{id}', [AppointmentController::class, 'update']);
});

Route::middleware(['auth.api', 'throttle:api'])->group(function () {
    // Public services endpoint (accessible to all authenticated users)
    Route::get('/services', [ServiceController::class, 'index']);
});

Route::middleware(['auth.api', 'throttle:api', 'role:receptionist,admin,manager,cashier,veterinary,customer'])->group(function () {
    // Customer endpoint is scoped by CustomersController when role is customer
    Route::get('/customers', [CustomersController::class, 'index']);

    // Pets endpoint is scoped by PetController when role is customer
    Route::get('/pets', [PetController::class, 'index']);

    // Customer pets endpoint is scoped by CustomersController when role is customer
    Route::get('/customers/{id}/pets', [CustomersController::class, 'pets']);
});

// Boarding/Hotel Room Management Routes
Route::middleware(['throttle:api'])->group(function () {
    Route::get('/boarding/rooms/available', [BoardingRoomController::class, 'getAvailableRooms']);
    Route::get('/boarding/rooms/calculate-total', [BoardingRoomController::class, 'calculateTotal']);
    Route::get('/boarding/rooms/types', [BoardingRoomController::class, 'getRoomTypes']);
    Route::get('/boarding/add-ons', [BoardingController::class, 'getAddOns']);
    Route::get('/boarding/rooms', [BoardingRoomController::class, 'index']);
    Route::get('/boarding/rooms/{id}', [BoardingRoomController::class, 'show']);
});

// Secure File Access Routes (auth required)
Route::middleware(['auth.api', 'throttle:api'])->prefix('files')->group(function () {
    Route::get('/payment-proofs/{type}/{id}/view', [SecureFileController::class, 'viewPaymentProof']);
    Route::get('/vaccination-cards/{id}/view', [SecureFileController::class, 'viewVaccinationCard']);
    Route::get('/pet-photos/{petId}/view', [SecureFileController::class, 'viewPetImage']);
});

// Profile photos are public (avatars are not sensitive)
Route::prefix('files')->group(function () {
    Route::get('/profile-photos/{userId}/view', [SecureFileController::class, 'viewProfilePhoto']);
});
