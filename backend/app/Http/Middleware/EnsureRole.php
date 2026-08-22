<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();


        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $normalizedRole = $this->normalizeRole($user->role);
        $allowedRoles = array_map([$this, 'normalizeRole'], $roles);

        // super_admin bypasses all STAFF route checks — blocked from customer-only routes
        if ($normalizedRole === 'super_admin') {
            if (count($allowedRoles) === 1 && $allowedRoles[0] === 'customer') {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
            return $next($request);
        }

        // super_receptionist = receptionist + cashier + inventory
        if ($normalizedRole === 'super_receptionist') {
            $expanded = ['receptionist', 'cashier', 'inventory'];
            if (!empty(array_intersect($allowedRoles, $expanded))) {
                return $next($request);
            }
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (!in_array($normalizedRole, $allowedRoles, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return $next($request);
    }

    private function normalizeRole(string $role): string
    {
        if (in_array($role, ['vet', 'veterinarian'], true)) {
            return 'veterinary';
        }

        return $role;
    }
}
