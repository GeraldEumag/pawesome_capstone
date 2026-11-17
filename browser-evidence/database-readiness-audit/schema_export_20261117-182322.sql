
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `actor_role` varchar(255) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'general',
  `subcategory` varchar(255) DEFAULT NULL,
  `reference_type` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `changes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`changes`)),
  `ip_address` varchar(255) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'completed',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `activity_logs_user_id_created_at_index` (`user_id`,`created_at`),
  KEY `activity_logs_category_created_at_index` (`category`,`created_at`),
  KEY `activity_logs_action_created_at_index` (`action`,`created_at`),
  KEY `activity_logs_reference_type_reference_id_index` (`reference_type`,`reference_id`),
  CONSTRAINT `activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `add_ons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `add_ons` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `add_on_type` enum('inventory_item','service') NOT NULL,
  `charge_type` enum('one_time','per_day') NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `species_allowed` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`species_allowed`)),
  `size_allowed` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`size_allowed`)),
  `inventory_item_id` bigint(20) unsigned DEFAULT NULL,
  `quantity_per_unit` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `add_ons_add_on_type_index` (`add_on_type`),
  KEY `add_ons_inventory_item_id_index` (`inventory_item_id`),
  KEY `add_ons_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointment_status_rollback_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `appointment_status_rollback_map` (
  `appointment_id` bigint(20) unsigned NOT NULL,
  `old_status` varchar(40) NOT NULL,
  `old_confinement_recommended` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`appointment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `appointments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `service_request_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `pet_id` bigint(20) unsigned NOT NULL,
  `service_id` bigint(20) unsigned NOT NULL,
  `veterinarian_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `scheduled_at` datetime NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `checked_in_at` timestamp NULL DEFAULT NULL,
  `checked_in_by` bigint(20) unsigned DEFAULT NULL,
  `clinical_completed_at` timestamp NULL DEFAULT NULL,
  `clinical_completed_by` bigint(20) unsigned DEFAULT NULL,
  `checked_out_at` timestamp NULL DEFAULT NULL,
  `checked_out_by` bigint(20) unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `outcome` varchar(40) DEFAULT NULL,
  `emergency` tinyint(1) NOT NULL DEFAULT 0,
  `confinement_recommended` tinyint(1) NOT NULL DEFAULT 0,
  `follow_up_required` tinyint(1) NOT NULL DEFAULT 0,
  `follow_up_due` date DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `payment_status` varchar(255) NOT NULL DEFAULT 'unpaid',
  `consultation_fee` decimal(10,2) DEFAULT NULL,
  `base_amount` decimal(10,2) DEFAULT 0.00,
  `additional_charges` decimal(10,2) DEFAULT 0.00,
  `total_amount` decimal(10,2) DEFAULT 0.00,
  `amount_paid` decimal(10,2) DEFAULT 0.00,
  `balance_due` decimal(10,2) DEFAULT 0.00,
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `diagnosis` text DEFAULT NULL,
  `treatment_notes` text DEFAULT NULL,
  `prescription` text DEFAULT NULL,
  `vet_remarks` text DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `reminder_sent_at` timestamp NULL DEFAULT NULL,
  `booking_channel` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `appointments_pet_id_foreign` (`pet_id`),
  KEY `appointments_service_id_foreign` (`service_id`),
  KEY `appointments_status_index` (`status`),
  KEY `appointments_scheduled_at_index` (`scheduled_at`),
  KEY `appointments_customer_id_status_index` (`customer_id`,`status`),
  KEY `appointments_veterinarian_id_status_index` (`veterinarian_id`,`status`),
  KEY `appointments_scheduled_at_status_index` (`scheduled_at`,`status`),
  KEY `idx_appointments_status` (`status`),
  KEY `idx_appointments_scheduled_at` (`scheduled_at`),
  KEY `idx_appointments_service_request_id` (`service_request_id`),
  KEY `appointments_booking_channel_index` (`booking_channel`),
  CONSTRAINT `appointments_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_service_id_foreign` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_veterinarian_id_foreign` FOREIGN KEY (`veterinarian_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `date` date NOT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `break_time` time DEFAULT '01:00:00',
  `total_hours` decimal(5,2) DEFAULT 0.00,
  `overtime_hours` decimal(5,2) DEFAULT 0.00,
  `status` enum('present','absent','late','early_leave','on_leave') NOT NULL DEFAULT 'present',
  `source` enum('web','fingerprint_terminal','biometric','manual','barcode','kiosk','auto') NOT NULL DEFAULT 'web',
  `biometric_id` varchar(255) DEFAULT NULL,
  `terminal_id` varchar(255) DEFAULT NULL,
  `is_late` tinyint(1) NOT NULL DEFAULT 0,
  `is_early_leave` tinyint(1) NOT NULL DEFAULT 0,
  `location` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `review_status` varchar(255) NOT NULL DEFAULT 'pending',
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `salary_rate` decimal(10,2) DEFAULT NULL,
  `daily_earnings` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_user_id_date_unique` (`user_id`,`date`),
  UNIQUE KEY `attendance_employee_date_unique` (`employee_id`,`date`),
  KEY `attendance_approved_by_foreign` (`approved_by`),
  KEY `attendance_date_status_index` (`date`,`status`),
  CONSTRAINT `attendance_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3439 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_corrections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance_corrections` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `attendance_id` bigint(20) unsigned DEFAULT NULL,
  `date` date NOT NULL,
  `requested_check_in` time DEFAULT NULL,
  `requested_check_out` time DEFAULT NULL,
  `reason` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` bigint(20) unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `attendance_corrections_attendance_id_foreign` (`attendance_id`),
  KEY `attendance_corrections_reviewed_by_foreign` (`reviewed_by`),
  KEY `attendance_corrections_user_id_status_index` (`user_id`,`status`),
  KEY `attendance_corrections_date_status_index` (`date`,`status`),
  CONSTRAINT `attendance_corrections_attendance_id_foreign` FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_corrections_reviewed_by_foreign` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_corrections_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `staff_id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `date` date NOT NULL,
  `status` enum('Present','Absent','Late') NOT NULL DEFAULT 'Present',
  `method` enum('Manual','Biometric') NOT NULL DEFAULT 'Manual',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `biometric_credentials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `biometric_credentials` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `credential_id` varchar(255) NOT NULL,
  `public_key` text DEFAULT NULL,
  `type` enum('fingerprint','face','pin') NOT NULL DEFAULT 'fingerprint',
  `device_name` varchar(255) DEFAULT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `biometric_credentials_credential_id_unique` (`credential_id`),
  KEY `biometric_credentials_user_id_type_index` (`user_id`,`type`),
  CONSTRAINT `biometric_credentials_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `boarding_care_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `boarding_care_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `boarding_id` bigint(20) unsigned DEFAULT NULL,
  `confinement_id` bigint(20) unsigned DEFAULT NULL,
  `logged_by` bigint(20) unsigned NOT NULL,
  `log_type` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `notes` text NOT NULL,
  `feeding_amount` varchar(255) DEFAULT NULL,
  `medication_given` text DEFAULT NULL,
  `behavior_notes` text DEFAULT NULL,
  `health_observation` text DEFAULT NULL,
  `photo_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `boarding_care_logs_boarding_id_foreign` (`boarding_id`),
  KEY `boarding_care_logs_confinement_id_foreign` (`confinement_id`),
  KEY `boarding_care_logs_logged_by_foreign` (`logged_by`),
  CONSTRAINT `boarding_care_logs_boarding_id_foreign` FOREIGN KEY (`boarding_id`) REFERENCES `boardings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `boarding_care_logs_confinement_id_foreign` FOREIGN KEY (`confinement_id`) REFERENCES `medical_confinements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `boarding_care_logs_logged_by_foreign` FOREIGN KEY (`logged_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `boarding_room_reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `boarding_room_reservations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `room_id` bigint(20) unsigned NOT NULL,
  `source_type` varchar(255) NOT NULL,
  `source_id` bigint(20) unsigned NOT NULL,
  `pet_id` bigint(20) unsigned NOT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `check_in_date` date NOT NULL,
  `check_out_date` date NOT NULL,
  `status` enum('pending','approved','scheduled','checked_in','in_stay','checked_out','cancelled','confined') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `room_reservations_dates` (`room_id`,`check_in_date`,`check_out_date`),
  KEY `room_reservations_source` (`source_type`,`source_id`),
  KEY `room_reservations_pet_status` (`pet_id`,`status`),
  KEY `room_reservations_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `boarding_rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `boarding_rooms` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `room_code` varchar(255) NOT NULL,
  `room_name` varchar(255) NOT NULL,
  `room_type` varchar(255) NOT NULL,
  `hotel_category` varchar(255) DEFAULT NULL,
  `allowed_species` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`allowed_species`)),
  `max_capacity` int(11) NOT NULL DEFAULT 1,
  `total_rooms` int(11) NOT NULL DEFAULT 1,
  `daily_rate` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `customer_selectable` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `boarding_rooms_room_code_unique` (`room_code`),
  KEY `boarding_rooms_room_type_is_active_index` (`room_type`,`is_active`),
  KEY `boarding_rooms_customer_selectable_index` (`customer_selectable`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `boardings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `boardings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `service_request_id` bigint(20) unsigned DEFAULT NULL,
  `pet_id` bigint(20) unsigned DEFAULT NULL,
  `pet_name` varchar(255) DEFAULT NULL,
  `pet_type` varchar(255) DEFAULT NULL,
  `pet_breed` varchar(255) DEFAULT NULL,
  `stay_type` varchar(255) NOT NULL DEFAULT 'hotel_boarding',
  `check_in` datetime NOT NULL,
  `check_in_time` time DEFAULT NULL,
  `check_out` datetime DEFAULT NULL,
  `check_out_time` time DEFAULT NULL,
  `status` enum('pending','approved','scheduled','confirmed','checked_in','in_care','ready_for_pickup','checked_out','completed','cancelled','rejected') NOT NULL DEFAULT 'pending',
  `base_amount` decimal(10,2) DEFAULT 0.00,
  `additional_charges` decimal(10,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `vaccination_card` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `hotel_room_id` bigint(20) unsigned DEFAULT NULL,
  `boarding_type` varchar(255) DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `amount_paid` decimal(10,2) DEFAULT 0.00,
  `balance_due` decimal(10,2) DEFAULT 0.00,
  `payment_status` enum('unpaid','pending','partial','paid','rejected','refunded') NOT NULL DEFAULT 'unpaid',
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` varchar(255) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `cancellation_reason` varchar(500) DEFAULT NULL,
  `special_requests` text DEFAULT NULL,
  `feeding_instructions` text DEFAULT NULL,
  `medication_notes` text DEFAULT NULL,
  `reminder_sent_at` timestamp NULL DEFAULT NULL,
  `emergency_contact` varchar(255) DEFAULT NULL,
  `emergency_phone` varchar(255) DEFAULT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `actual_check_in` timestamp NULL DEFAULT NULL,
  `checked_in_by` bigint(20) unsigned DEFAULT NULL,
  `checked_in_at` timestamp NULL DEFAULT NULL,
  `ready_for_pickup_by` bigint(20) unsigned DEFAULT NULL,
  `ready_for_pickup_at` timestamp NULL DEFAULT NULL,
  `actual_check_out` timestamp NULL DEFAULT NULL,
  `checked_out_by` bigint(20) unsigned DEFAULT NULL,
  `checked_out_at` timestamp NULL DEFAULT NULL,
  `vaccination_card_verified_at` timestamp NULL DEFAULT NULL,
  `booking_channel` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `boardings_hotel_room_id_status_index` (`hotel_room_id`,`status`),
  KEY `boardings_check_in_check_out_index` (`check_in`,`check_out`),
  KEY `boardings_customer_id_status_index` (`customer_id`,`status`),
  KEY `boardings_status_index` (`status`),
  KEY `boardings_check_in_index` (`check_in`),
  KEY `boardings_pet_id_index` (`pet_id`),
  KEY `idx_boardings_status` (`status`),
  KEY `idx_boardings_check_in` (`check_in`),
  KEY `idx_boardings_room_status` (`hotel_room_id`,`status`),
  KEY `idx_boardings_service_request_id` (`service_request_id`),
  KEY `boardings_booking_channel_index` (`booking_channel`),
  CONSTRAINT `boardings_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `boardings_hotel_room_id_foreign` FOREIGN KEY (`hotel_room_id`) REFERENCES `hotel_rooms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `boardings_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_addons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_addons` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint(20) unsigned NOT NULL,
  `add_on_id` bigint(20) unsigned NOT NULL,
  `inventory_item_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `add_on_type` enum('inventory_item','service') NOT NULL,
  `charge_type` enum('one_time','per_day') NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `number_of_days` int(11) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `inventory_deducted_at` timestamp NULL DEFAULT NULL,
  `inventory_deducted_by` bigint(20) unsigned DEFAULT NULL,
  `inventory_deducted_quantity` int(11) DEFAULT NULL,
  `deduction_status` enum('pending','deducted','restored') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `booking_addons_booking_id_add_on_id_index` (`booking_id`,`add_on_id`),
  KEY `booking_addons_inventory_item_id_index` (`inventory_item_id`),
  KEY `booking_addons_add_on_type_index` (`add_on_type`),
  KEY `booking_addons_inventory_deducted_at_index` (`inventory_deducted_at`),
  KEY `booking_addons_deduction_status_index` (`deduction_status`),
  KEY `booking_addons_inventory_deducted_by_index` (`inventory_deducted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(100) NOT NULL,
  `request_type` varchar(50) NOT NULL,
  `service_name` varchar(100) NOT NULL,
  `request_date` date NOT NULL,
  `status` enum('pending','approved','rejected','rescheduled','paid','in_progress','completed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chatbot_faqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chatbot_faqs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'general',
  `keywords` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`keywords`)),
  `scope` varchar(255) NOT NULL DEFAULT 'general',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chatbot_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `chatbot_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `channel` varchar(255) NOT NULL DEFAULT 'web',
  `type` enum('inquiry','booking','general') NOT NULL,
  `intent` varchar(255) DEFAULT NULL,
  `scope` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `user_message` text DEFAULT NULL,
  `response` text DEFAULT NULL,
  `bot_response` text DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `chatbot_logs_user_id_foreign` (`user_id`),
  KEY `chatbot_logs_type_index` (`type`),
  KEY `chatbot_logs_created_at_index` (`created_at`),
  CONSTRAINT `chatbot_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `clinic_payment_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `clinic_payment_accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `provider` varchar(20) NOT NULL,
  `account_name` varchar(255) NOT NULL,
  `account_last4` varchar(8) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `clinic_accounts_provider_idx` (`provider`,`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `confinement_status_rollback_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `confinement_status_rollback_map` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `confinement_id` bigint(20) unsigned NOT NULL,
  `old_status` varchar(40) NOT NULL,
  `new_status` varchar(40) NOT NULL,
  `old_care_level` varchar(40) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `confinement_status_rollback_map_confinement_id_unique` (`confinement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_order_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_order_id` bigint(20) unsigned NOT NULL,
  `inventory_item_id` bigint(20) unsigned NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_order_items_customer_order_id_foreign` (`customer_order_id`),
  KEY `customer_order_items_inventory_item_id_foreign` (`inventory_item_id`),
  CONSTRAINT `customer_order_items_customer_order_id_foreign` FOREIGN KEY (`customer_order_id`) REFERENCES `customer_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_order_items_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint(20) unsigned NOT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `order_type` varchar(50) NOT NULL DEFAULT 'Pick-up',
  `payment_method` varchar(50) NOT NULL DEFAULT 'Online Payment',
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` text DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `payment_status` varchar(30) NOT NULL DEFAULT 'unpaid',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_orders_customer_id_foreign` (`customer_id`),
  KEY `customer_orders_approved_by_foreign` (`approved_by`),
  KEY `customer_orders_verified_by_foreign` (`verified_by`),
  KEY `customer_orders_rejected_by_foreign` (`rejected_by`),
  KEY `customer_orders_customer_email_index` (`customer_email`),
  KEY `customer_orders_payment_status_index` (`payment_status`),
  KEY `customer_orders_receipt_number_index` (`receipt_number`),
  CONSTRAINT `customer_orders_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `customer_orders_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_orders_rejected_by_foreign` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customer_orders_verified_by_foreign` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `original_email` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `loyalty_points` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `telegram_chat_id` varchar(255) DEFAULT NULL,
  `notification_preferences` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`notification_preferences`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `deletion_reason` varchar(500) DEFAULT NULL,
  `deleted_by` bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customers_email_unique` (`email`),
  KEY `customers_email_index` (`email`),
  KEY `customers_name_index` (`name`),
  KEY `customers_user_id_foreign` (`user_id`),
  KEY `customers_deleted_by_foreign` (`deleted_by`),
  CONSTRAINT `customers_deleted_by_foreign` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `diagnostic_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `diagnostic_orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `appointment_id` bigint(20) unsigned NOT NULL,
  `code` varchar(30) NOT NULL,
  `order_type` enum('lab','imaging','other') NOT NULL DEFAULT 'lab',
  `name` varchar(255) NOT NULL,
  `priority` enum('routine','urgent','stat') NOT NULL DEFAULT 'routine',
  `status` enum('ordered','collected','resulted','reviewed','cancelled') NOT NULL DEFAULT 'ordered',
  `notes` text DEFAULT NULL,
  `ordered_by` bigint(20) unsigned DEFAULT NULL,
  `ordered_at` timestamp NULL DEFAULT NULL,
  `collected_by` bigint(20) unsigned DEFAULT NULL,
  `collected_at` timestamp NULL DEFAULT NULL,
  `resulted_by` bigint(20) unsigned DEFAULT NULL,
  `resulted_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` bigint(20) unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` bigint(20) unsigned DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancel_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `diagnostic_orders_code_unique` (`code`),
  KEY `diagnostic_orders_appointment_id_status_index` (`appointment_id`,`status`),
  CONSTRAINT `diagnostic_orders_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `diagnostic_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `diagnostic_results` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `diagnostic_order_id` bigint(20) unsigned NOT NULL,
  `findings` text DEFAULT NULL,
  `attachment_path` varchar(255) DEFAULT NULL,
  `is_abnormal` tinyint(1) NOT NULL DEFAULT 0,
  `resulted_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `diagnostic_results_diagnostic_order_id_foreign` (`diagnostic_order_id`),
  CONSTRAINT `diagnostic_results_diagnostic_order_id_foreign` FOREIGN KEY (`diagnostic_order_id`) REFERENCES `diagnostic_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `email_deliveries` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL,
  `event_key` varchar(120) NOT NULL,
  `occurrence_key` varchar(191) NOT NULL,
  `source_type` varchar(80) DEFAULT NULL,
  `source_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `recipient_email` text NOT NULL,
  `recipient_fingerprint` varchar(64) NOT NULL,
  `payload` longtext NOT NULL,
  `suppression` longtext DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'pending',
  `attempts` smallint(5) unsigned NOT NULL DEFAULT 0,
  `max_attempts` smallint(5) unsigned NOT NULL DEFAULT 4,
  `next_attempt_at` timestamp NULL DEFAULT NULL,
  `locked_at` timestamp NULL DEFAULT NULL,
  `locked_by` varchar(80) DEFAULT NULL,
  `dispatched_at` timestamp NULL DEFAULT NULL,
  `last_attempt_at` timestamp NULL DEFAULT NULL,
  `provider_message_id` varchar(255) DEFAULT NULL,
  `provider_status` varchar(24) DEFAULT NULL,
  `failure_class` varchar(24) DEFAULT NULL,
  `failure_code` varchar(80) DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_deliveries_occurrence_unique` (`event_key`,`occurrence_key`),
  UNIQUE KEY `email_deliveries_uuid_unique` (`uuid`),
  KEY `email_deliveries_status_next_attempt_at_index` (`status`,`next_attempt_at`),
  KEY `email_deliveries_source_type_source_id_index` (`source_type`,`source_id`),
  KEY `email_deliveries_user_id_index` (`user_id`),
  KEY `email_deliveries_recipient_fingerprint_index` (`recipient_fingerprint`),
  KEY `email_deliveries_status_index` (`status`),
  KEY `email_deliveries_next_attempt_at_index` (`next_attempt_at`),
  KEY `email_deliveries_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_verification_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `email_verification_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `employee_day_offs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employee_day_offs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `weekday` tinyint(3) unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_day_offs_user_id_weekday_unique` (`user_id`,`weekday`),
  UNIQUE KEY `employee_day_offs_employee_id_weekday_unique` (`employee_id`,`weekday`),
  CONSTRAINT `employee_day_offs_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `employee_day_offs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employees` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_no` varchar(20) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `first_name` varchar(255) NOT NULL,
  `middle_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) NOT NULL,
  `suffix` varchar(255) DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `civil_status` varchar(30) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `emergency_contact_name` varchar(255) DEFAULT NULL,
  `emergency_contact_phone` varchar(30) DEFAULT NULL,
  `position` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `employment_status` varchar(30) NOT NULL DEFAULT 'probationary',
  `employment_type` varchar(30) NOT NULL DEFAULT 'full_time',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `base_salary` decimal(12,2) NOT NULL DEFAULT 0.00,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `sss_no` varchar(20) DEFAULT NULL,
  `philhealth_no` varchar(20) DEFAULT NULL,
  `pagibig_no` varchar(20) DEFAULT NULL,
  `tin_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_employee_no_unique` (`employee_no`),
  KEY `employees_user_id_foreign` (`user_id`),
  KEY `employees_is_active_department_index` (`is_active`,`department`),
  CONSTRAINT `employees_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `failed_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gift_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gift_cards` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `number` varchar(255) NOT NULL,
  `balance` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `issued_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gift_cards_number_unique` (`number`),
  KEY `gift_cards_customer_id_foreign` (`customer_id`),
  CONSTRAINT `gift_cards_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `grooming_appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `grooming_appointments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pet_id` bigint(20) unsigned DEFAULT NULL,
  `pet_name` varchar(255) NOT NULL,
  `service` varchar(255) NOT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` time DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `grooming_appointments_pet_id_foreign` (`pet_id`),
  CONSTRAINT `grooming_appointments_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `groomings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `groomings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `service_request_id` bigint(20) unsigned DEFAULT NULL,
  `appointment_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `pet_id` bigint(20) unsigned NOT NULL,
  `service` varchar(255) NOT NULL,
  `appointment_date` date NOT NULL,
  `appointment_time` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_status` varchar(255) NOT NULL DEFAULT 'unpaid',
  `base_amount` decimal(10,2) DEFAULT 0.00,
  `additional_charges` decimal(10,2) DEFAULT 0.00,
  `total_amount` decimal(10,2) DEFAULT 0.00,
  `amount_paid` decimal(10,2) DEFAULT 0.00,
  `balance_due` decimal(10,2) DEFAULT 0.00,
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` varchar(255) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `cancellation_reason` varchar(500) DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `booking_channel` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `groomings_pet_id_foreign` (`pet_id`),
  KEY `groomings_customer_id_status_index` (`customer_id`,`status`),
  KEY `groomings_appointment_date_status_index` (`appointment_date`,`status`),
  KEY `idx_groomings_service_request_id` (`service_request_id`),
  KEY `groomings_booking_channel_index` (`booking_channel`),
  KEY `groomings_appointment_id_foreign` (`appointment_id`),
  CONSTRAINT `groomings_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `groomings_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `groomings_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `holidays` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('regular','special_non_working') NOT NULL DEFAULT 'regular',
  `year` smallint(6) NOT NULL,
  `is_recurring` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'True for fixed-date holidays that repeat every year (e.g. New Year)',
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `holidays_date_name_unique` (`date`,`name`),
  KEY `holidays_created_by_foreign` (`created_by`),
  KEY `holidays_year_type_index` (`year`,`type`),
  CONSTRAINT `holidays_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `hotel_rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `hotel_rooms` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `room_number` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `type` enum('standard','deluxe','suite','kennel','cattery') NOT NULL DEFAULT 'standard',
  `size` enum('small','medium','large','suite') NOT NULL DEFAULT 'medium',
  `capacity` int(11) NOT NULL DEFAULT 1,
  `daily_rate` decimal(10,2) NOT NULL,
  `status` enum('available','occupied','maintenance','cleaning','reserved','inactive') NOT NULL DEFAULT 'available',
  `amenities` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`amenities`)),
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `hotel_rooms_room_number_unique` (`room_number`),
  UNIQUE KEY `idx_hotel_rooms_number_unique` (`room_number`),
  KEY `hotel_rooms_status_type_index` (`status`,`type`),
  KEY `hotel_rooms_size_status_index` (`size`,`status`),
  KEY `idx_hotel_rooms_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `idempotency_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `idempotency_keys` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `key` varchar(128) NOT NULL,
  `method` varchar(10) NOT NULL,
  `route` varchar(255) NOT NULL,
  `request_hash` varchar(64) NOT NULL,
  `response_status` smallint(5) unsigned NOT NULL,
  `response_body` mediumtext NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_keys_user_key_route_unique` (`user_id`,`key`,`route`),
  CONSTRAINT `idempotency_keys_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventory_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_batches` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `inventory_item_id` bigint(20) unsigned NOT NULL,
  `batch_no` varchar(255) DEFAULT NULL,
  `received_date` date NOT NULL,
  `manufacturing_date` date DEFAULT NULL,
  `supplier` varchar(255) DEFAULT NULL,
  `unit_cost` decimal(10,2) DEFAULT NULL,
  `proof_photo` varchar(255) DEFAULT NULL,
  `expiration_date` date DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `remaining_quantity` int(11) NOT NULL,
  `status` enum('active','expired','depleted','disposed','audit_adjusted') NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `inventory_batches_inventory_item_id_status_index` (`inventory_item_id`,`status`),
  KEY `inventory_batches_expiration_date_index` (`expiration_date`),
  CONSTRAINT `inventory_batches_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=382 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventory_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sku` varchar(255) NOT NULL,
  `barcode` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('Food','Accessories','Grooming','Toys','Health','Services') NOT NULL DEFAULT 'Accessories',
  `item_class` varchar(30) NOT NULL DEFAULT 'retail',
  `brand` varchar(255) DEFAULT NULL,
  `generic_name` varchar(255) DEFAULT NULL,
  `supplier` varchar(255) DEFAULT NULL,
  `supplier_id` bigint(20) unsigned DEFAULT NULL,
  `description` text DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `reorder_level` int(11) NOT NULL DEFAULT 10,
  `threshold` int(11) NOT NULL DEFAULT 10,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cost` decimal(10,2) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `status` enum('active','inactive','discontinued','archived') NOT NULL DEFAULT 'active',
  `archived_at` timestamp NULL DEFAULT NULL,
  `archived_by` bigint(20) unsigned DEFAULT NULL,
  `archive_reason` text DEFAULT NULL,
  `is_sellable` tinyint(1) NOT NULL DEFAULT 1,
  `is_service_consumable` tinyint(1) NOT NULL DEFAULT 0,
  `requires_expiry_tracking` tinyint(1) NOT NULL DEFAULT 0,
  `issue_method` enum('FIFO','FEFO','Manual') NOT NULL DEFAULT 'FEFO',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_items_sku_unique` (`sku`),
  UNIQUE KEY `inventory_items_barcode_unique` (`barcode`),
  KEY `inventory_items_sku_index` (`sku`),
  KEY `inventory_items_stock_index` (`stock`),
  KEY `inventory_items_reorder_level_index` (`reorder_level`),
  KEY `idx_inventory_category` (`category`),
  KEY `inventory_items_archived_by_foreign` (`archived_by`),
  KEY `inventory_items_status_archived_at_index` (`status`,`archived_at`),
  KEY `inventory_items_is_service_consumable_index` (`is_service_consumable`),
  KEY `inventory_items_issue_method_index` (`issue_method`),
  KEY `inventory_items_supplier_id_foreign` (`supplier_id`),
  KEY `inventory_items_item_class_index` (`item_class`),
  CONSTRAINT `inventory_items_archived_by_foreign` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `inventory_items_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_stock_nonnegative` CHECK (`stock` >= 0),
  CONSTRAINT `chk_price_nonnegative` CHECK (`price` >= 0),
  CONSTRAINT `chk_reorder_nonnegative` CHECK (`reorder_level` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=838 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventory_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `inventory_item_id` bigint(20) unsigned NOT NULL,
  `delta` int(11) NOT NULL,
  `quantity` int(11) DEFAULT NULL,
  `previous_stock` int(11) DEFAULT NULL,
  `new_stock` int(11) DEFAULT NULL,
  `stock_before` int(11) DEFAULT NULL,
  `stock_after` int(11) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `reference_type` varchar(255) DEFAULT NULL,
  `reference_id` bigint(20) unsigned DEFAULT NULL,
  `item_name_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of item name at time of log',
  `item_sku_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of item SKU at time of log',
  `item_category_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of item category at time of log',
  `reference` varchar(255) DEFAULT NULL,
  `movement_type` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `inventory_logs_inventory_item_id_index` (`inventory_item_id`),
  KEY `inventory_logs_created_at_index` (`created_at`),
  KEY `inventory_logs_user_id_foreign` (`user_id`),
  KEY `inventory_logs_movement_type_index` (`movement_type`),
  KEY `inventory_logs_reference_id_index` (`reference_id`),
  CONSTRAINT `inventory_logs_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=383 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inventory_monthly_audits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_monthly_audits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `inventory_item_id` bigint(20) unsigned NOT NULL,
  `system_stock` int(11) NOT NULL DEFAULT 0,
  `actual_stock` int(11) NOT NULL DEFAULT 0,
  `variance` int(11) NOT NULL DEFAULT 0,
  `audit_month` varchar(255) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'matched',
  `approval_status` varchar(30) NOT NULL DEFAULT 'auto_approved',
  `reason` text DEFAULT NULL,
  `checked_by` varchar(255) DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `inventory_monthly_audits_inventory_item_id_foreign` (`inventory_item_id`),
  KEY `inventory_monthly_audits_approved_by_foreign` (`approved_by`),
  CONSTRAINT `inventory_monthly_audits_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `inventory_monthly_audits_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sale_id` bigint(20) unsigned NOT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `invoice_number` varchar(255) NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `status` enum('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
  `subtotal` decimal(12,2) NOT NULL,
  `tax_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(12,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `terms` text DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoices_invoice_number_unique` (`invoice_number`),
  KEY `invoices_sale_id_foreign` (`sale_id`),
  KEY `invoices_invoice_number_index` (`invoice_number`),
  KEY `invoices_customer_id_status_index` (`customer_id`,`status`),
  CONSTRAINT `invoices_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `invoices_sale_id_foreign` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL,
  `reserved_at` int(10) unsigned DEFAULT NULL,
  `available_at` int(10) unsigned NOT NULL,
  `created_at` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `landing_page_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `landing_page_contents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `section_key` varchar(50) NOT NULL,
  `content_type` varchar(20) NOT NULL DEFAULT 'json',
  `content_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content_data`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `landing_page_contents_section_key_unique` (`section_key`),
  KEY `landing_page_contents_updated_by_foreign` (`updated_by`),
  CONSTRAINT `landing_page_contents_updated_by_foreign` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leave_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leave_balances` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `leave_type` enum('sick_leave','vacation_leave','emergency_leave','maternity_leave','paternity_leave','bereavement_leave','service_incentive_leave','solo_parent_leave','magna_carta_leave','special_leave_benefit') NOT NULL,
  `year` smallint(6) NOT NULL,
  `total_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `used_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `remaining_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lb_user_type_year` (`user_id`,`leave_type`,`year`),
  UNIQUE KEY `lb_emp_type_year` (`employee_id`,`leave_type`,`year`),
  KEY `leave_balances_year_leave_type_index` (`year`,`leave_type`),
  CONSTRAINT `leave_balances_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `leave_balances_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `leave_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leave_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `type` enum('sick_leave','vacation_leave','emergency_leave','maternity_leave','paternity_leave','bereavement_leave','service_incentive_leave','solo_parent_leave','magna_carta_leave','special_leave_benefit','unpaid_leave') NOT NULL DEFAULT 'sick_leave',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` text DEFAULT NULL,
  `half_day` tinyint(4) NOT NULL DEFAULT 0 COMMENT '0=full day, 1=AM half, 2=PM half',
  `attachment_path` varchar(255) DEFAULT NULL,
  `days_counted` decimal(5,1) NOT NULL DEFAULT 1.0 COMMENT 'Computed working days this leave covers',
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `manager_remarks` text DEFAULT NULL,
  `reviewed_by` bigint(20) unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `leave_requests_reviewed_by_foreign` (`reviewed_by`),
  KEY `leave_requests_user_id_status_index` (`user_id`,`status`),
  KEY `leave_requests_start_date_end_date_index` (`start_date`,`end_date`),
  CONSTRAINT `leave_requests_reviewed_by_foreign` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `leave_requests_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `live_chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `live_chat_messages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `session_id` bigint(20) unsigned NOT NULL,
  `sender_type` enum('customer','staff','system') NOT NULL,
  `sender_id` bigint(20) unsigned DEFAULT NULL,
  `sender_name` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `is_read_by_staff` tinyint(1) NOT NULL DEFAULT 0,
  `is_read_by_customer` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `live_chat_messages_sender_id_foreign` (`sender_id`),
  KEY `live_chat_messages_session_id_id_index` (`session_id`,`id`),
  CONSTRAINT `live_chat_messages_sender_id_foreign` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `live_chat_messages_session_id_foreign` FOREIGN KEY (`session_id`) REFERENCES `live_chat_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `live_chat_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `live_chat_sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `customer_name` varchar(255) NOT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `status` enum('waiting','active','closed') NOT NULL DEFAULT 'waiting',
  `assigned_to` bigint(20) unsigned DEFAULT NULL,
  `last_message_at` timestamp NULL DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `live_chat_sessions_assigned_to_foreign` (`assigned_to`),
  KEY `live_chat_sessions_status_last_message_at_index` (`status`,`last_message_at`),
  KEY `live_chat_sessions_customer_id_index` (`customer_id`),
  CONSTRAINT `live_chat_sessions_assigned_to_foreign` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `live_chat_sessions_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `login_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `action` varchar(255) NOT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'success',
  `failure_reason` varchar(255) DEFAULT NULL,
  `logged_out_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `login_logs_user_id_created_at_index` (`user_id`,`created_at`),
  KEY `login_logs_email_created_at_index` (`email`,`created_at`),
  KEY `login_logs_action_created_at_index` (`action`,`created_at`),
  KEY `login_logs_ip_address_created_at_index` (`ip_address`,`created_at`),
  CONSTRAINT `login_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=250 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medical_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_attachments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `medical_record_id` bigint(20) unsigned NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `file_type` varchar(255) NOT NULL,
  `attachment_type` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `uploaded_by` bigint(20) unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medical_attachments_medical_record_id_foreign` (`medical_record_id`),
  KEY `medical_attachments_uploaded_by_foreign` (`uploaded_by`),
  CONSTRAINT `medical_attachments_medical_record_id_foreign` FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medical_attachments_uploaded_by_foreign` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medical_confinements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_confinements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `consultation_id` bigint(20) unsigned NOT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `pet_id` bigint(20) unsigned DEFAULT NULL,
  `pet_name` varchar(255) DEFAULT NULL,
  `vet_id` bigint(20) unsigned NOT NULL,
  `room_id` bigint(20) unsigned DEFAULT NULL,
  `ward_bed_id` bigint(20) unsigned DEFAULT NULL,
  `diagnosis` text NOT NULL,
  `reason_for_confinement` text NOT NULL,
  `urgency_level` varchar(255) NOT NULL DEFAULT 'normal',
  `care_level` varchar(30) NOT NULL DEFAULT 'observation',
  `consent_id` bigint(20) unsigned DEFAULT NULL,
  `expected_stay_days` int(10) unsigned DEFAULT NULL,
  `treatment_plan` text DEFAULT NULL,
  `medication_plan` text DEFAULT NULL,
  `observation_instructions` text DEFAULT NULL,
  `special_care_instructions` text DEFAULT NULL,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `deposit_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `daily_rate` decimal(10,2) DEFAULT NULL,
  `last_accrual_at` timestamp NULL DEFAULT NULL,
  `final_amount` decimal(10,2) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'recommended',
  `payment_status` varchar(255) NOT NULL DEFAULT 'unpaid',
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` varchar(255) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `admitted_by` bigint(20) unsigned DEFAULT NULL,
  `admitted_at` timestamp NULL DEFAULT NULL,
  `discharge_cleared_by` bigint(20) unsigned DEFAULT NULL,
  `discharge_cleared_at` timestamp NULL DEFAULT NULL,
  `discharged_by` bigint(20) unsigned DEFAULT NULL,
  `discharged_at` timestamp NULL DEFAULT NULL,
  `discharge_outcome` varchar(40) DEFAULT NULL,
  `override_by` bigint(20) unsigned DEFAULT NULL,
  `override_reason` varchar(255) DEFAULT NULL,
  `override_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `booking_channel` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medical_confinements_consultation_id_foreign` (`consultation_id`),
  KEY `medical_confinements_customer_id_foreign` (`customer_id`),
  KEY `medical_confinements_pet_id_foreign` (`pet_id`),
  KEY `medical_confinements_vet_id_foreign` (`vet_id`),
  KEY `medical_confinements_room_id_foreign` (`room_id`),
  KEY `medical_confinements_booking_channel_index` (`booking_channel`),
  KEY `medical_confinements_ward_bed_id_foreign` (`ward_bed_id`),
  KEY `medical_confinements_consent_id_foreign` (`consent_id`),
  KEY `medical_confinements_override_by_foreign` (`override_by`),
  CONSTRAINT `medical_confinements_consent_id_foreign` FOREIGN KEY (`consent_id`) REFERENCES `visit_consents` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_confinements_consultation_id_foreign` FOREIGN KEY (`consultation_id`) REFERENCES `appointments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medical_confinements_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_confinements_override_by_foreign` FOREIGN KEY (`override_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_confinements_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_confinements_room_id_foreign` FOREIGN KEY (`room_id`) REFERENCES `hotel_rooms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_confinements_vet_id_foreign` FOREIGN KEY (`vet_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medical_confinements_ward_bed_id_foreign` FOREIGN KEY (`ward_bed_id`) REFERENCES `ward_beds` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medical_progress_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_progress_notes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `confinement_id` bigint(20) unsigned NOT NULL,
  `vet_id` bigint(20) unsigned NOT NULL,
  `note_type` varchar(255) NOT NULL,
  `diagnosis_update` text DEFAULT NULL,
  `treatment_given` text DEFAULT NULL,
  `medication_given` text DEFAULT NULL,
  `vital_signs` text DEFAULT NULL,
  `prescription` text DEFAULT NULL,
  `recommendations` text DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medical_progress_notes_confinement_id_foreign` (`confinement_id`),
  KEY `medical_progress_notes_vet_id_foreign` (`vet_id`),
  CONSTRAINT `medical_progress_notes_confinement_id_foreign` FOREIGN KEY (`confinement_id`) REFERENCES `medical_confinements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medical_progress_notes_vet_id_foreign` FOREIGN KEY (`vet_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medical_record_addenda`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_record_addenda` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `medical_record_id` bigint(20) unsigned NOT NULL,
  `author_id` bigint(20) unsigned NOT NULL,
  `body` text NOT NULL,
  `content_hash` varchar(64) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medical_record_addenda_medical_record_id_foreign` (`medical_record_id`),
  KEY `medical_record_addenda_author_id_foreign` (`author_id`),
  CONSTRAINT `medical_record_addenda_author_id_foreign` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`),
  CONSTRAINT `medical_record_addenda_medical_record_id_foreign` FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medical_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pet_id` bigint(20) unsigned NOT NULL,
  `appointment_id` bigint(20) unsigned DEFAULT NULL,
  `veterinarian_id` bigint(20) unsigned NOT NULL,
  `visit_date` datetime NOT NULL,
  `chief_complaint` text DEFAULT NULL,
  `symptoms` text DEFAULT NULL,
  `physical_examination` text DEFAULT NULL,
  `diagnosis` text DEFAULT NULL,
  `secondary_diagnosis` text DEFAULT NULL,
  `treatment_plan` text DEFAULT NULL,
  `procedure_notes` text DEFAULT NULL,
  `follow_up_instructions` text DEFAULT NULL,
  `weight_kg` decimal(5,2) DEFAULT NULL,
  `temperature_celsius` decimal(4,1) DEFAULT NULL,
  `heart_rate` int(11) DEFAULT NULL,
  `respiratory_rate` int(11) DEFAULT NULL,
  `body_condition_score` varchar(255) DEFAULT NULL,
  `status` enum('draft','finalized','locked') NOT NULL DEFAULT 'draft',
  `finalized_at` timestamp NULL DEFAULT NULL,
  `finalized_by` bigint(20) unsigned DEFAULT NULL,
  `content_hash` varchar(64) DEFAULT NULL,
  `is_editable` tinyint(1) NOT NULL DEFAULT 1,
  `locked_at` timestamp NULL DEFAULT NULL,
  `locked_by` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medical_records_appointment_id_foreign` (`appointment_id`),
  KEY `medical_records_locked_by_foreign` (`locked_by`),
  KEY `medical_records_pet_id_index` (`pet_id`),
  KEY `medical_records_veterinarian_id_index` (`veterinarian_id`),
  KEY `medical_records_visit_date_index` (`visit_date`),
  KEY `medical_records_status_index` (`status`),
  KEY `medical_records_finalized_by_foreign` (`finalized_by`),
  CONSTRAINT `medical_records_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_records_finalized_by_foreign` FOREIGN KEY (`finalized_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_records_locked_by_foreign` FOREIGN KEY (`locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medical_records_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medical_records_veterinarian_id_foreign` FOREIGN KEY (`veterinarian_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `medication_administration_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_administration_records` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `medical_confinement_id` bigint(20) unsigned NOT NULL,
  `prescription_id` bigint(20) unsigned DEFAULT NULL,
  `inventory_item_id` bigint(20) unsigned DEFAULT NULL,
  `inventory_batch_id` bigint(20) unsigned DEFAULT NULL,
  `medication_name` varchar(255) NOT NULL,
  `dose` varchar(255) DEFAULT NULL,
  `route` varchar(255) DEFAULT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'scheduled',
  `administered_at` timestamp NULL DEFAULT NULL,
  `administered_by` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `medication_administration_records_prescription_id_foreign` (`prescription_id`),
  KEY `medication_administration_records_inventory_item_id_foreign` (`inventory_item_id`),
  KEY `medication_administration_records_inventory_batch_id_foreign` (`inventory_batch_id`),
  KEY `medication_administration_records_administered_by_foreign` (`administered_by`),
  KEY `mar_confinement_status_index` (`medical_confinement_id`,`status`),
  CONSTRAINT `medication_administration_records_administered_by_foreign` FOREIGN KEY (`administered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medication_administration_records_inventory_batch_id_foreign` FOREIGN KEY (`inventory_batch_id`) REFERENCES `inventory_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medication_administration_records_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `medication_administration_records_medical_confinement_id_foreign` FOREIGN KEY (`medical_confinement_id`) REFERENCES `medical_confinements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medication_administration_records_prescription_id_foreign` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=183 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` enum('success','warning','error','info') NOT NULL DEFAULT 'info',
  `read` tinyint(1) NOT NULL DEFAULT 0,
  `related_type` varchar(255) DEFAULT NULL,
  `related_id` bigint(20) unsigned DEFAULT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_user_id_read_index` (`user_id`,`read`),
  KEY `notifications_role_read_index` (`role`,`read`),
  KEY `notifications_related_type_related_id_index` (`related_type`,`related_id`),
  CONSTRAINT `notifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_receipts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payable_type` varchar(50) NOT NULL,
  `payable_id` bigint(20) unsigned NOT NULL,
  `uploaded_by` bigint(20) unsigned DEFAULT NULL,
  `disk` varchar(20) NOT NULL DEFAULT 'private',
  `disk_path` varchar(255) NOT NULL,
  `mime` varchar(100) DEFAULT NULL,
  `size_bytes` bigint(20) unsigned DEFAULT NULL,
  `sha256` char(64) NOT NULL,
  `phash` varchar(32) DEFAULT NULL,
  `provider` varchar(20) DEFAULT NULL,
  `submitted_reference` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(100) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'uploaded',
  `reject_reason` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_receipts_idem_uniq` (`payable_type`,`payable_id`,`idempotency_key`),
  KEY `payment_receipts_uploaded_by_foreign` (`uploaded_by`),
  KEY `payment_receipts_payable_idx` (`payable_type`,`payable_id`),
  KEY `payment_receipts_sha256_idx` (`sha256`),
  KEY `payment_receipts_phash_idx` (`phash`),
  KEY `payment_receipts_status_idx` (`status`),
  CONSTRAINT `payment_receipts_uploaded_by_foreign` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_references`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_references` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `provider` varchar(20) NOT NULL,
  `reference_normalized` varchar(255) NOT NULL,
  `payable_type` varchar(50) NOT NULL,
  `payable_id` bigint(20) unsigned NOT NULL,
  `receipt_id` bigint(20) unsigned DEFAULT NULL,
  `confirmed_by` bigint(20) unsigned DEFAULT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_references_uniq` (`provider`,`reference_normalized`),
  KEY `payment_references_receipt_id_foreign` (`receipt_id`),
  KEY `payment_references_confirmed_by_foreign` (`confirmed_by`),
  KEY `payment_references_payable_idx` (`payable_type`,`payable_id`),
  CONSTRAINT `payment_references_confirmed_by_foreign` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payment_references_receipt_id_foreign` FOREIGN KEY (`receipt_id`) REFERENCES `payment_receipts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_settlement_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_settlement_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_settlement_id` bigint(20) unsigned NOT NULL,
  `service_item_usage_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `unit_price` decimal(12,2) NOT NULL,
  `total_price` decimal(12,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `payment_settlement_items_payment_settlement_id_index` (`payment_settlement_id`),
  KEY `payment_settlement_items_service_item_usage_id_index` (`service_item_usage_id`),
  CONSTRAINT `payment_settlement_items_payment_settlement_id_foreign` FOREIGN KEY (`payment_settlement_id`) REFERENCES `payment_settlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_settlement_items_service_item_usage_id_foreign` FOREIGN KEY (`service_item_usage_id`) REFERENCES `service_item_usages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payment_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_settlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `settleable_type` varchar(50) NOT NULL,
  `settleable_id` bigint(20) unsigned NOT NULL,
  `visit_invoice_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'PHP',
  `status` enum('paid','voided','refunded') NOT NULL DEFAULT 'paid',
  `payment_method` varchar(50) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `voided_by` bigint(20) unsigned DEFAULT NULL,
  `void_reason` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_settlements_idempotency_key_unique` (`idempotency_key`),
  UNIQUE KEY `payment_settlements_receipt_number_unique` (`receipt_number`),
  KEY `payment_settlements_settleable_type_settleable_id_index` (`settleable_type`,`settleable_id`),
  KEY `payment_settlements_customer_id_index` (`customer_id`),
  KEY `payment_settlements_visit_invoice_id_index` (`visit_invoice_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sale_id` bigint(20) unsigned NOT NULL,
  `payment_number` varchar(255) NOT NULL,
  `payment_method` enum('cash','credit_card','debit_card','gcash','maya','bank_transfer','check') NOT NULL DEFAULT 'cash',
  `card_type` varchar(255) DEFAULT NULL,
  `card_last_four` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `change_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `paid_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payments_payment_number_unique` (`payment_number`),
  KEY `payments_sale_id_status_index` (`sale_id`,`status`),
  KEY `payments_payment_method_index` (`payment_method`),
  CONSTRAINT `payments_sale_id_foreign` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `chk_change_nonnegative` CHECK (`change_amount` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payrolls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payrolls` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payroll_id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `employee_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `employment_type` enum('regular','part_time','contractual') NOT NULL DEFAULT 'regular',
  `rate_type` enum('daily','hourly','monthly') NOT NULL DEFAULT 'monthly',
  `base_salary` decimal(12,2) NOT NULL,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `working_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `present_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `absent_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `paid_leave_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `incomplete_punch_days` smallint(5) unsigned NOT NULL DEFAULT 0,
  `regular_hours` decimal(6,2) NOT NULL DEFAULT 0.00,
  `overtime_hours` decimal(6,2) NOT NULL DEFAULT 0.00,
  `overtime_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `regular_holiday_pay` decimal(10,2) DEFAULT 0.00,
  `special_holiday_pay` decimal(10,2) DEFAULT 0.00,
  `night_differential` decimal(10,2) DEFAULT 0.00,
  `rest_day_pay` decimal(10,2) NOT NULL DEFAULT 0.00,
  `regular_holiday_ot_pay` decimal(10,2) DEFAULT 0.00,
  `special_holiday_ot_pay` decimal(10,2) DEFAULT 0.00,
  `rest_day_ot_pay` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `non_taxable_allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `commission` decimal(12,2) NOT NULL DEFAULT 0.00,
  `other_earnings` decimal(12,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `tax_deduction` decimal(12,2) NOT NULL DEFAULT 0.00,
  `sss_contribution` decimal(12,2) NOT NULL DEFAULT 0.00,
  `philhealth_contribution` decimal(12,2) NOT NULL DEFAULT 0.00,
  `pagibig_contribution` decimal(12,2) NOT NULL DEFAULT 0.00,
  `sss_er_share` decimal(12,2) NOT NULL DEFAULT 0.00,
  `philhealth_er_share` decimal(12,2) NOT NULL DEFAULT 0.00,
  `pagibig_er_share` decimal(12,2) NOT NULL DEFAULT 0.00,
  `late_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `absent_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `undertime_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `undertime_minutes` int(10) unsigned NOT NULL DEFAULT 0,
  `salary_loan` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cash_advance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `loans_settled` tinyint(1) NOT NULL DEFAULT 0,
  `gross_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `pay_period_start` varchar(255) NOT NULL,
  `pay_period_end` varchar(255) NOT NULL,
  `pay_period_label` varchar(255) NOT NULL,
  `status` enum('draft','processing','pending','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
  `payment_date` date DEFAULT NULL,
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_reference` varchar(100) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `processed_by` bigint(20) unsigned DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `manual_attendance` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`manual_attendance`)),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payrolls_payroll_id_unique` (`payroll_id`),
  UNIQUE KEY `payroll_user_period_unique` (`user_id`,`pay_period_start`,`pay_period_end`),
  UNIQUE KEY `payroll_employee_period_unique` (`employee_id`,`pay_period_start`,`pay_period_end`),
  KEY `payrolls_processed_by_foreign` (`processed_by`),
  KEY `payrolls_status_pay_period_label_index` (`status`,`pay_period_label`),
  KEY `payrolls_approved_by_foreign` (`approved_by`),
  CONSTRAINT `payrolls_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payrolls_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payrolls_processed_by_foreign` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payrolls_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) NOT NULL,
  `tokenable_id` bigint(20) unsigned NOT NULL,
  `name` text NOT NULL,
  `token` varchar(64) NOT NULL,
  `abilities` text DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=231 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pets` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `species` varchar(255) NOT NULL,
  `breed` varchar(255) DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `archived_at` timestamp NULL DEFAULT NULL,
  `archived_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pets_customer_id_index` (`customer_id`),
  KEY `pets_name_index` (`name`),
  KEY `pets_status_archived_at_index` (`status`,`archived_at`),
  KEY `pets_archived_by_index` (`archived_by`),
  CONSTRAINT `pets_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `prescriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `prescriptions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `medical_record_id` bigint(20) unsigned NOT NULL,
  `veterinarian_id` bigint(20) unsigned NOT NULL,
  `medication_name` varchar(255) NOT NULL,
  `inventory_item_id` bigint(20) unsigned DEFAULT NULL,
  `generic_name` varchar(255) DEFAULT NULL,
  `medication_type` varchar(255) DEFAULT NULL,
  `dosage` varchar(255) NOT NULL,
  `dosage_unit` varchar(255) NOT NULL,
  `frequency` varchar(255) NOT NULL,
  `duration` varchar(255) NOT NULL,
  `route` varchar(255) NOT NULL,
  `instructions` text DEFAULT NULL,
  `quantity_prescribed` decimal(8,2) NOT NULL,
  `quantity_unit` varchar(255) NOT NULL,
  `refills_allowed` int(11) NOT NULL DEFAULT 0,
  `refills_remaining` int(11) NOT NULL DEFAULT 0,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `side_effects_notes` text DEFAULT NULL,
  `pharmacist_notes` text DEFAULT NULL,
  `is_editable` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `prescriptions_veterinarian_id_foreign` (`veterinarian_id`),
  KEY `prescriptions_medical_record_id_index` (`medical_record_id`),
  KEY `prescriptions_medication_name_index` (`medication_name`),
  KEY `prescriptions_is_active_index` (`is_active`),
  KEY `prescriptions_inventory_item_id_index` (`inventory_item_id`),
  CONSTRAINT `prescriptions_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `prescriptions_medical_record_id_foreign` FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `prescriptions_veterinarian_id_foreign` FOREIGN KEY (`veterinarian_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `provider_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `provider_configs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `provider` varchar(20) NOT NULL,
  `reference_pattern` varchar(255) DEFAULT NULL,
  `min_length` tinyint(3) unsigned DEFAULT NULL,
  `max_length` tinyint(3) unsigned DEFAULT NULL,
  `reference_labels` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`reference_labels`)),
  `accepted_status_texts` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`accepted_status_texts`)),
  `confusion_map` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`confusion_map`)),
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `provider_configs_provider_unique` (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `recall_dispatches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `recall_dispatches` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `kind` varchar(40) NOT NULL,
  `ref_id` bigint(20) unsigned NOT NULL,
  `due_date` date DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `notification_id` bigint(20) unsigned DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `recall_dispatches_kind_ref_due_unique` (`kind`,`ref_id`,`due_date`),
  KEY `recall_dispatches_user_id_foreign` (`user_id`),
  KEY `recall_dispatches_notification_id_foreign` (`notification_id`),
  KEY `recall_dispatches_kind_sent_at_index` (`kind`,`sent_at`),
  CONSTRAINT `recall_dispatches_notification_id_foreign` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recall_dispatches_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `receipt_corrections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receipt_corrections` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `receipt_id` bigint(20) unsigned NOT NULL,
  `field` varchar(40) NOT NULL,
  `old_value` varchar(255) DEFAULT NULL,
  `new_value` varchar(255) DEFAULT NULL,
  `corrected_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `receipt_corrections_corrected_by_foreign` (`corrected_by`),
  KEY `receipt_corrections_receipt_idx` (`receipt_id`),
  CONSTRAINT `receipt_corrections_corrected_by_foreign` FOREIGN KEY (`corrected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `receipt_corrections_receipt_id_foreign` FOREIGN KEY (`receipt_id`) REFERENCES `payment_receipts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `receipt_extractions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receipt_extractions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `receipt_id` bigint(20) unsigned NOT NULL,
  `reader` varchar(20) NOT NULL,
  `reader_version` varchar(100) DEFAULT NULL,
  `provider` varchar(20) DEFAULT NULL,
  `transaction_type` varchar(30) DEFAULT NULL,
  `reference_raw` varchar(255) DEFAULT NULL,
  `reference_normalized` varchar(255) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `status_text` varchar(255) DEFAULT NULL,
  `recipient_name` varchar(255) DEFAULT NULL,
  `recipient_last4` varchar(8) DEFAULT NULL,
  `sender_name` varchar(255) DEFAULT NULL,
  `image_quality` varchar(10) DEFAULT NULL,
  `confidence_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`confidence_json`)),
  `raw_response_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw_response_json`)),
  `latency_ms` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `receipt_extractions_receipt_idx` (`receipt_id`),
  CONSTRAINT `receipt_extractions_receipt_id_foreign` FOREIGN KEY (`receipt_id`) REFERENCES `payment_receipts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `receipt_validations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `receipt_validations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `receipt_id` bigint(20) unsigned NOT NULL,
  `rule` varchar(40) NOT NULL,
  `result` varchar(10) NOT NULL,
  `detail` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `receipt_validations_rule_idx` (`receipt_id`,`rule`),
  CONSTRAINT `receipt_validations_receipt_id_foreign` FOREIGN KEY (`receipt_id`) REFERENCES `payment_receipts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_alert_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `report_alert_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `report_alert_id` bigint(20) unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `context` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`context`)),
  `triggered_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `report_alert_history_report_alert_id_foreign` (`report_alert_id`),
  CONSTRAINT `report_alert_history_report_alert_id_foreign` FOREIGN KEY (`report_alert_id`) REFERENCES `report_alerts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `report_alerts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `threshold` decimal(12,2) NOT NULL DEFAULT 0.00,
  `channels` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`channels`)),
  `frequency` varchar(255) NOT NULL DEFAULT 'daily',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `salary_loans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `salary_loans` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `loan_type` enum('salary_loan','cash_advance') NOT NULL DEFAULT 'salary_loan',
  `principal` decimal(12,2) NOT NULL,
  `balance` decimal(12,2) NOT NULL,
  `installment_amount` decimal(12,2) NOT NULL COMMENT 'Amount deducted per payroll cutoff',
  `start_period` date NOT NULL COMMENT 'First payroll period to deduct',
  `end_period` date DEFAULT NULL COMMENT 'Expected last deduction period (null = until paid)',
  `status` enum('active','paid','cancelled') NOT NULL DEFAULT 'active',
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `salary_loans_approved_by_foreign` (`approved_by`),
  KEY `salary_loans_user_id_status_index` (`user_id`,`status`),
  KEY `salary_loans_employee_id_status_index` (`employee_id`,`status`),
  CONSTRAINT `salary_loans_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `salary_loans_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `salary_loans_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sale_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sale_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned DEFAULT NULL,
  `service_id` bigint(20) unsigned DEFAULT NULL,
  `item_name` varchar(255) NOT NULL,
  `item_type` varchar(255) NOT NULL DEFAULT 'product',
  `quantity` int(11) NOT NULL DEFAULT 1,
  `unit_price` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_price` decimal(12,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sale_items_product_id_foreign` (`product_id`),
  KEY `sale_items_service_id_foreign` (`service_id`),
  KEY `sale_items_sale_id_item_type_index` (`sale_id`,`item_type`),
  CONSTRAINT `sale_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sale_items_sale_id_foreign` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_items_service_id_foreign` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `amount` decimal(10,2) NOT NULL,
  `cash_amount` decimal(8,2) DEFAULT NULL,
  `card_amount` decimal(8,2) DEFAULT NULL,
  `type` enum('appointment','boarding','product') NOT NULL,
  `payment_type` varchar(255) NOT NULL DEFAULT 'cash',
  `payment_method` varchar(255) NOT NULL DEFAULT 'cash',
  `status` enum('pending','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_code` varchar(255) DEFAULT NULL,
  `appointment_id` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `void_reason` text DEFAULT NULL,
  `voided_by` varchar(255) DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `cashier_id` bigint(20) unsigned DEFAULT NULL,
  `transaction_number` varchar(255) NOT NULL,
  `product_id` bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_transaction_number_unique` (`transaction_number`),
  KEY `sales_customer_id_foreign` (`customer_id`),
  KEY `sales_cashier_id_foreign` (`cashier_id`),
  KEY `sales_type_index` (`type`),
  KEY `sales_appointment_id_index` (`appointment_id`),
  KEY `sales_created_at_index` (`created_at`),
  KEY `sales_product_id_foreign` (`product_id`),
  CONSTRAINT `sales_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sales_cashier_id_foreign` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sales_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_billing_payment_request_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_billing_payment_request_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_request_id` bigint(20) unsigned NOT NULL,
  `service_item_usage_id` bigint(20) unsigned DEFAULT NULL,
  `item_type` varchar(50) DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `unit` varchar(50) DEFAULT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `total_price` decimal(12,2) NOT NULL,
  `is_discount` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sbpri_request_idx` (`payment_request_id`),
  KEY `sbpri_item_idx` (`service_item_usage_id`),
  CONSTRAINT `sbpri_request_fk` FOREIGN KEY (`payment_request_id`) REFERENCES `service_billing_payment_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sbpri_service_item_fk` FOREIGN KEY (`service_item_usage_id`) REFERENCES `service_item_usages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_billing_payment_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_billing_payment_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `appointment_id` bigint(20) unsigned NOT NULL,
  `service_request_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `pet_name` varchar(255) DEFAULT NULL,
  `service_name` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `amount_due` decimal(12,2) NOT NULL,
  `invoice_version` char(64) NOT NULL,
  `payment_channel` varchar(20) NOT NULL,
  `payment_method` varchar(30) DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` varchar(255) DEFAULT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'awaiting_cashier',
  `receipt_number` varchar(255) DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `cash_received` decimal(12,2) DEFAULT NULL,
  `change_amount` decimal(12,2) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_billing_payment_requests_receipt_number_unique` (`receipt_number`),
  KEY `service_billing_payment_requests_service_request_id_foreign` (`service_request_id`),
  KEY `service_billing_payment_requests_created_by_foreign` (`created_by`),
  KEY `service_billing_payment_requests_verified_by_foreign` (`verified_by`),
  KEY `service_billing_payment_requests_customer_id_status_index` (`customer_id`,`status`),
  KEY `service_billing_payment_requests_appointment_id_status_index` (`appointment_id`,`status`),
  KEY `service_billing_payment_requests_payment_channel_status_index` (`payment_channel`,`status`),
  CONSTRAINT `service_billing_payment_requests_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`),
  CONSTRAINT `service_billing_payment_requests_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_billing_payment_requests_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `service_billing_payment_requests_service_request_id_foreign` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_billing_payment_requests_verified_by_foreign` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_item_usages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_item_usages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `service_type` enum('veterinary','grooming','boarding','cashier') NOT NULL DEFAULT 'veterinary',
  `item_name_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of item name at time of usage',
  `item_sku_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of item SKU at time of usage',
  `pet_name_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of pet name at time of usage',
  `service_name_snapshot` varchar(255) DEFAULT NULL COMMENT 'Snapshot of service name at time of usage',
  `service_id` bigint(20) unsigned DEFAULT NULL COMMENT 'Reference to appointment, grooming, boarding, or sale ID',
  `appointment_id` bigint(20) unsigned DEFAULT NULL,
  `pet_id` bigint(20) unsigned DEFAULT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `inventory_item_id` bigint(20) unsigned DEFAULT NULL,
  `batch_id` bigint(20) unsigned DEFAULT NULL,
  `batch_deductions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`batch_deductions`)),
  `quantity_used` int(10) unsigned NOT NULL COMMENT 'Quantity of inventory item used',
  `unit` varchar(255) DEFAULT NULL COMMENT 'Unit of measurement (pcs, ml, mg, etc.)',
  `usage_type` varchar(255) DEFAULT NULL,
  `used_by` bigint(20) unsigned DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL COMMENT 'Usage notes or purpose',
  `item_type` varchar(255) DEFAULT NULL COMMENT 'Type of billing item: base_service, add_on_service, inventory_usage, manual_charge, discount',
  `description` varchar(255) DEFAULT NULL COMMENT 'Description of the billing item',
  `unit_price` decimal(10,2) DEFAULT 0.00 COMMENT 'Unit price of the item',
  `total_price` decimal(10,2) DEFAULT 0.00 COMMENT 'Total price (quantity * unit_price)',
  `charge_amount` decimal(10,2) DEFAULT 0.00,
  `is_billable` tinyint(1) DEFAULT 0 COMMENT 'Whether this item is billable',
  `is_paid` tinyint(1) DEFAULT 0 COMMENT 'Whether this item has been paid',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `service_item_usages_pet_id_foreign` (`pet_id`),
  KEY `service_item_usages_batch_id_foreign` (`batch_id`),
  KEY `service_item_usages_used_by_foreign` (`used_by`),
  KEY `service_item_usages_service_type_service_id_index` (`service_type`,`service_id`),
  KEY `service_item_usages_appointment_id_pet_id_index` (`appointment_id`,`pet_id`),
  KEY `service_item_usages_inventory_item_id_index` (`inventory_item_id`),
  KEY `service_item_usages_created_at_index` (`created_at`),
  KEY `service_billing_index` (`service_type`,`service_id`,`is_billable`),
  KEY `billing_payment_index` (`is_billable`,`is_paid`),
  CONSTRAINT `service_item_usages_appointment_id_foreign` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_item_usages_batch_id_foreign` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_item_usages_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_item_usages_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_item_usages_used_by_foreign` FOREIGN KEY (`used_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `service_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `request_type` varchar(255) NOT NULL,
  `service_type` varchar(255) DEFAULT NULL,
  `preferred_date` date DEFAULT NULL,
  `preferred_time` time DEFAULT NULL,
  `customer_name` varchar(255) NOT NULL,
  `pet_id` bigint(20) unsigned DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `pet_name` varchar(255) DEFAULT NULL,
  `pet_type` varchar(50) DEFAULT NULL,
  `service_name` varchar(255) NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `request_date` date DEFAULT NULL,
  `check_out_date` date DEFAULT NULL,
  `boarding_room_id` bigint(20) unsigned DEFAULT NULL,
  `room_name` varchar(255) DEFAULT NULL,
  `room_type` varchar(255) DEFAULT NULL,
  `daily_rate` decimal(10,2) DEFAULT NULL,
  `total_days` int(11) DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `request_time` varchar(255) DEFAULT NULL,
  `status` enum('pending','scheduled','approved','rejected','cancelled','canceled','completed','paid','confirmed','rescheduled','in_progress','checked_in') NOT NULL DEFAULT 'pending',
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint(20) unsigned DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `cancellation_reason` varchar(500) DEFAULT NULL,
  `receptionist_remarks` text DEFAULT NULL,
  `payment_status` enum('unpaid','pending','partial','paid','rejected','refunded') NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `cashier_remarks` text DEFAULT NULL,
  `receipt_number` varchar(255) DEFAULT NULL,
  `reference_number` varchar(255) DEFAULT NULL,
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `payment_proof` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `booking_channel` varchar(20) DEFAULT NULL,
  `ready_for_pickup_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `service_requests_pet_id_foreign` (`pet_id`),
  KEY `service_requests_customer_id_foreign` (`customer_id`),
  KEY `service_requests_booking_channel_index` (`booking_channel`),
  CONSTRAINT `service_requests_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_requests_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `services` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'Other',
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `duration` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `description` text DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `duration_minutes` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `suppliers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL,
  `value` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_settings_key_unique` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `thirteenth_month_accruals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `thirteenth_month_accruals` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `year` smallint(6) NOT NULL,
  `jan_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `feb_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `mar_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `apr_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `may_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `jun_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `jul_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `aug_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `sep_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `oct_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `nov_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `dec_basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_accrued` decimal(12,2) NOT NULL DEFAULT 0.00,
  `paid_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `paid_date` date DEFAULT NULL,
  `status` enum('accruing','paid','partial') NOT NULL DEFAULT 'accruing',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tma_user_year` (`user_id`,`year`),
  UNIQUE KEY `tma_emp_year` (`employee_id`,`year`),
  CONSTRAINT `thirteenth_month_accruals_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `thirteenth_month_accruals_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_no` varchar(20) DEFAULT NULL,
  `original_employee_no` varchar(20) DEFAULT NULL,
  `sss_no` varchar(20) DEFAULT NULL,
  `philhealth_no` varchar(20) DEFAULT NULL,
  `pagibig_no` varchar(20) DEFAULT NULL,
  `tin` varchar(20) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `first_name` varchar(255) DEFAULT NULL,
  `middle_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `zip_code` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `bio` text DEFAULT NULL,
  `profile_image` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `emergency_contact_person` varchar(255) DEFAULT NULL,
  `emergency_contact_number` varchar(255) DEFAULT NULL,
  `suffix` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `original_username` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `original_email` varchar(255) DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(255) NOT NULL DEFAULT 'customer',
  `base_salary` decimal(12,2) DEFAULT NULL,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `work_start_time` time DEFAULT '08:00:00',
  `work_end_time` time DEFAULT '17:00:00',
  `working_days_per_week` int(11) DEFAULT 5,
  `department` varchar(255) DEFAULT NULL,
  `position` varchar(255) DEFAULT NULL,
  `employment_date` date DEFAULT NULL,
  `employment_status` enum('active','probationary','resigned','terminated') NOT NULL DEFAULT 'active',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `remember_token` varchar(100) DEFAULT NULL,
  `telegram_chat_id` varchar(255) DEFAULT NULL,
  `profile_photo` varchar(255) DEFAULT NULL,
  `telegram_username` varchar(255) DEFAULT NULL,
  `telegram_linked_at` timestamp NULL DEFAULT NULL,
  `api_token` varchar(80) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_username_unique` (`username`),
  UNIQUE KEY `users_api_token_unique` (`api_token`),
  UNIQUE KEY `users_telegram_chat_id_unique` (`telegram_chat_id`),
  UNIQUE KEY `users_employee_no_unique` (`employee_no`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vaccinations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `vaccinations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pet_id` bigint(20) unsigned NOT NULL,
  `medical_record_id` bigint(20) unsigned DEFAULT NULL,
  `veterinarian_id` bigint(20) unsigned NOT NULL,
  `vaccine_name` varchar(255) NOT NULL,
  `vaccine_type` varchar(255) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `lot_number` varchar(255) DEFAULT NULL,
  `inventory_batch_id` bigint(20) unsigned DEFAULT NULL,
  `vaccine_expiry_date` date DEFAULT NULL,
  `date_administered` date NOT NULL,
  `next_due_date` date DEFAULT NULL,
  `dosage` decimal(8,3) DEFAULT NULL,
  `dosage_unit` varchar(255) NOT NULL DEFAULT 'mL',
  `route_of_administration` varchar(255) DEFAULT NULL,
  `site_of_administration` varchar(255) DEFAULT NULL,
  `status` enum('given','pending','overdue','waived') NOT NULL DEFAULT 'given',
  `notes` text DEFAULT NULL,
  `is_editable` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vaccinations_medical_record_id_foreign` (`medical_record_id`),
  KEY `vaccinations_veterinarian_id_foreign` (`veterinarian_id`),
  KEY `vaccinations_pet_id_index` (`pet_id`),
  KEY `vaccinations_vaccine_name_index` (`vaccine_name`),
  KEY `vaccinations_date_administered_index` (`date_administered`),
  KEY `vaccinations_next_due_date_index` (`next_due_date`),
  KEY `vaccinations_inventory_batch_id_foreign` (`inventory_batch_id`),
  CONSTRAINT `vaccinations_inventory_batch_id_foreign` FOREIGN KEY (`inventory_batch_id`) REFERENCES `inventory_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `vaccinations_medical_record_id_foreign` FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records` (`id`) ON DELETE SET NULL,
  CONSTRAINT `vaccinations_pet_id_foreign` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `vaccinations_veterinarian_id_foreign` FOREIGN KEY (`veterinarian_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `visit_consents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visit_consents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `consentable_type` varchar(60) NOT NULL,
  `consentable_id` bigint(20) unsigned NOT NULL,
  `type` varchar(60) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text DEFAULT NULL,
  `signer_name` varchar(255) NOT NULL,
  `signer_relationship` varchar(60) NOT NULL DEFAULT 'owner',
  `channel` enum('portal','counter') NOT NULL DEFAULT 'counter',
  `signed_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `signed_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` enum('signed','revoked') NOT NULL DEFAULT 'signed',
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revoked_by` bigint(20) unsigned DEFAULT NULL,
  `revoke_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `visit_consents_consentable_type_consentable_id_index` (`consentable_type`,`consentable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `visit_invoice_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visit_invoice_adjustments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `visit_invoice_id` bigint(20) unsigned NOT NULL,
  `type` enum('discount','waiver','write_off','credit_note') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `reason_code` varchar(60) NOT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
  `requested_by` bigint(20) unsigned DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `applied_at` timestamp NULL DEFAULT NULL,
  `service_item_usage_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `visit_invoice_adjustments_visit_invoice_id_foreign` (`visit_invoice_id`),
  CONSTRAINT `visit_invoice_adjustments_visit_invoice_id_foreign` FOREIGN KEY (`visit_invoice_id`) REFERENCES `visit_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `visit_invoice_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visit_invoice_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `visit_invoice_id` bigint(20) unsigned NOT NULL,
  `service_item_usage_id` bigint(20) unsigned DEFAULT NULL,
  `item_type` varchar(40) NOT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `unit_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `is_billable` tinyint(1) NOT NULL DEFAULT 1,
  `is_paid` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vil_invoice_usage_unique` (`visit_invoice_id`,`service_item_usage_id`),
  CONSTRAINT `visit_invoice_lines_visit_invoice_id_foreign` FOREIGN KEY (`visit_invoice_id`) REFERENCES `visit_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `visit_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visit_invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(30) NOT NULL,
  `invoiceable_type` varchar(60) NOT NULL,
  `invoiceable_id` bigint(20) unsigned NOT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `status` enum('open','partially_paid','settled','voided') NOT NULL DEFAULT 'open',
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `amount_paid` decimal(12,2) NOT NULL DEFAULT 0.00,
  `balance_due` decimal(12,2) NOT NULL DEFAULT 0.00,
  `version_hash` varchar(64) DEFAULT NULL,
  `issued_at` timestamp NULL DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `voided_by` bigint(20) unsigned DEFAULT NULL,
  `void_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `visit_invoices_invoiceable_type_invoiceable_id_unique` (`invoiceable_type`,`invoiceable_id`),
  UNIQUE KEY `visit_invoices_invoice_number_unique` (`invoice_number`),
  KEY `visit_invoices_customer_id_index` (`customer_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ward_beds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ward_beds` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `ward` varchar(40) NOT NULL DEFAULT 'general',
  `is_isolation` tinyint(1) NOT NULL DEFAULT 0,
  `daily_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'available',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

