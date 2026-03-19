// lib/core/widgets/main_shell.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';

class MainShell extends StatelessWidget {
  final Widget child;
  const MainShell({required this.child, super.key});

  int _currentIndex(BuildContext context) {
    final loc = GoRouterState.of(context).matchedLocation;
    if (loc.startsWith('/shifts'))   return 0;
    if (loc.startsWith('/messages')) return 1;
    if (loc.startsWith('/profile'))  return 2;
    return 0;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: child,
    bottomNavigationBar: BottomNavigationBar(
      currentIndex: _currentIndex(context),
      onTap: (i) {
        switch (i) {
          case 0: context.go('/shifts');   break;
          case 1: context.go('/messages'); break;
          case 2: context.go('/profile');  break;
        }
      },
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.calendar_month), label: 'Turni'),
        BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline), label: 'Messaggi'),
        BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: 'Profilo'),
      ],
    ),
  );
}
