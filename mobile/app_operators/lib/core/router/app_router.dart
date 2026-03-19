// lib/core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/shifts/presentation/shifts_screen.dart';
import '../../features/shifts/presentation/appointment_detail_screen.dart';
import '../../features/attendance/presentation/checkin_screen.dart';
import '../../features/attendance/presentation/checkout_screen.dart';
import '../../features/attendance/presentation/note_screen.dart';
import '../../features/messages/presentation/messages_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../widgets/main_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/shifts',
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final isLoggedIn   = authState.valueOrNull != null;
      final isLoginRoute = state.matchedLocation == '/login';
      if (!isLoggedIn && !isLoginRoute) return '/login';
      if (isLoggedIn  &&  isLoginRoute) return '/shifts';
      return null;
    },
    routes: [
      GoRoute(
        path:    '/login',
        builder: (ctx, _) => const LoginScreen(),
      ),
      ShellRoute(
        builder: (ctx, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path:    '/shifts',
            builder: (ctx, _) => const ShiftsScreen(),
            routes: [
              GoRoute(
                path:    ':appointmentId',
                builder: (ctx, s) => AppointmentDetailScreen(
                  appointmentId: s.pathParameters['appointmentId']!,
                ),
                routes: [
                  GoRoute(
                    path:    'checkin',
                    builder: (ctx, s) => CheckInScreen(
                      appointmentId: s.pathParameters['appointmentId']!,
                    ),
                  ),
                  GoRoute(
                    path:    'checkout',
                    builder: (ctx, s) => CheckOutScreen(
                      attendanceId:  s.uri.queryParameters['attendanceId']!,
                      appointmentId: s.pathParameters['appointmentId']!,
                    ),
                  ),
                  GoRoute(
                    path:    'note',
                    builder: (ctx, s) => NoteScreen(
                      attendanceId: s.uri.queryParameters['attendanceId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path:    '/messages',
            builder: (ctx, _) => const MessagesScreen(),
          ),
          GoRoute(
            path:    '/profile',
            builder: (ctx, _) => const ProfileScreen(),
          ),
        ],
      ),
    ],
    errorBuilder: (ctx, state) => Scaffold(
      body: Center(child: Text('Pagina non trovata: ${state.uri}')),
    ),
  );
});
