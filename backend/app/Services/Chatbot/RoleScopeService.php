<?php

namespace App\Services\Chatbot;

use App\Models\User;

class RoleScopeService
{
    public function normalizeRole(?string $role): string
    {
        if (!$role) {
            return 'guest';
        }

        return $role === 'vet' ? 'veterinary' : $role;
    }

    public function getRoleConfig(?User $user): array
    {
        $role = $this->normalizeRole($user?->role);

        $configs = [
            'admin' => [
                'label' => 'Admin',
                'welcome' => 'I can help you review chatbot activity, manage users, and navigate admin tools.',
                'scope' => 'administration',
                'suggestions' => [
                    'Show chatbot log summary',
                    'What can admins do with the chatbot?',
                    'Help me navigate reports',
                ],
            ],
            'manager' => [
                'label' => 'Manager',
                'welcome' => 'I can help with dashboard navigation, staff summaries, and operations guidance.',
                'scope' => 'management',
                'suggestions' => [
                    'Give me manager shortcuts',
                    'What can I monitor from here?',
                    'Help me navigate staff reports',
                ],
            ],
            'receptionist' => [
                'label' => 'Receptionist',
                'welcome' => 'I can help with bookings, appointment workflows, customer support, and service guidance.',
                'scope' => 'frontdesk',
                'suggestions' => [
                    'Help me with bookings',
                    'What can I answer for customers?',
                    'Show receptionist shortcuts',
                ],
            ],
            'veterinary' => [
                'label' => 'Veterinary',
                'welcome' => 'I can help with appointment queues, patient workflow guidance, and dashboard navigation.',
                'scope' => 'clinical',
                'suggestions' => [
                    'Show veterinary shortcuts',
                    'Help me navigate appointments',
                    'What can the vet dashboard do?',
                ],
            ],
            'cashier' => [
                'label' => 'Cashier',
                'welcome' => 'I can help with payment workflows, transaction guidance, and cashier dashboard navigation.',
                'scope' => 'billing',
                'suggestions' => [
                    'Show cashier shortcuts',
                    'Help me find transactions',
                    'How should I handle payments here?',
                ],
            ],
            'inventory' => [
                'label' => 'Inventory',
                'welcome' => 'I can help with stock workflows, low-stock guidance, and inventory dashboard navigation.',
                'scope' => 'inventory',
                'suggestions' => [
                    'Show inventory shortcuts',
                    'How do I monitor low stock?',
                    'Help me navigate inventory reports',
                ],
            ],
            'customer' => [
                'label' => 'Customer',
                'welcome' => 'I can help you with bookings, services, pet records, and support questions.',
                'scope' => 'customer_support',
                'suggestions' => [
                    'Book an appointment',
                    'Show service prices',
                    'What are your hours?',
                ],
            ],
            'super_admin' => [
                'label' => 'Super Admin',
                'welcome' => 'I can help you navigate any module across the entire system.',
                'scope' => 'administration',
                'suggestions' => [
                    'Show system overview',
                    'Navigate to front desk',
                    'View all reports',
                ],
            ],
            'super_receptionist' => [
                'label' => 'Super Receptionist',
                'welcome' => 'I can help with bookings, payments, and inventory management.',
                'scope' => 'frontdesk',
                'suggestions' => [
                    'Help me with bookings',
                    'Show POS shortcuts',
                    'Check inventory status',
                ],
            ],
            'guest' => [
                'label' => 'Guest',
                'welcome' => 'I can help with general questions and guide you to the right part of the system.',
                'scope' => 'general',
                'suggestions' => [
                    'What can you help with?',
                    'Show me available services',
                    'How do I contact support?',
                ],
            ],
        ];

        return $configs[$role] ?? $configs['guest'];
    }
}
