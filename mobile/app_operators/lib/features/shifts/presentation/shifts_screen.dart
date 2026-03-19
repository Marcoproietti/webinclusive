// lib/features/shifts/presentation/shifts_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import 'shifts_provider.dart';
import '../../../core/theme/app_theme.dart';

class ShiftsScreen extends ConsumerWidget {
  const ShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected     = ref.watch(selectedDateProvider);
    final shiftsAsync  = ref.watch(shiftsProvider);
    final apptsAsync   = ref.watch(appointmentsForDayProvider);

    // Costruisce set giorni con turno per il calendario
    final shiftDays = shiftsAsync.valueOrNull
      ?.map((s) => DateFormat('yyyy-MM-dd').format(s.shiftDate))
      .toSet() ?? {};

    return Scaffold(
      appBar: AppBar(
        title: const Text('I miei turni'),
        actions: [
          IconButton(
            icon: const Icon(Icons.today),
            onPressed: () => ref.read(selectedDateProvider.notifier).state = DateTime.now(),
          ),
        ],
      ),
      body: Column(children: [
        // Calendario
        TableCalendar(
          firstDay:       DateTime.now().subtract(const Duration(days: 90)),
          lastDay:        DateTime.now().add(const Duration(days: 180)),
          focusedDay:     selected,
          selectedDayPredicate: (d) => isSameDay(d, selected),
          calendarFormat: CalendarFormat.week,
          startingDayOfWeek: StartingDayOfWeek.monday,
          onDaySelected: (sel, _) =>
            ref.read(selectedDateProvider.notifier).state = sel,
          calendarBuilders: CalendarBuilders(
            markerBuilder: (ctx, day, _) {
              final key = DateFormat('yyyy-MM-dd').format(day);
              if (!shiftDays.contains(key)) return const SizedBox();
              return Positioned(
                bottom: 4,
                child: Container(
                  width: 6, height: 6,
                  decoration: const BoxDecoration(
                    color: AppTheme.primary, shape: BoxShape.circle,
                  ),
                ),
              );
            },
          ),
          calendarStyle: CalendarStyle(
            selectedDecoration: const BoxDecoration(
              color: AppTheme.primary, shape: BoxShape.circle,
            ),
            todayDecoration: BoxDecoration(
              color: AppTheme.secondary.withOpacity(0.3), shape: BoxShape.circle,
            ),
          ),
          headerStyle: const HeaderStyle(formatButtonVisible: false, titleCentered: true),
        ),

        const Divider(height: 1),

        // Lista appuntamenti
        Expanded(
          child: apptsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error:   (e, _) => Center(child: Text('Errore: $e')),
            data: (appts) => appts.isEmpty
              ? const _EmptyDay()
              : ListView.builder(
                  padding:     const EdgeInsets.all(12),
                  itemCount:   appts.length,
                  itemBuilder: (ctx, i) => _AppointmentCard(
                    appt: appts[i],
                    onTap: () => ctx.go('/shifts/${appts[i].id}'),
                  ),
                ),
          ),
        ),
      ]),
    );
  }
}

class _EmptyDay extends StatelessWidget {
  const _EmptyDay();
  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.event_available_outlined, size: 56, color: Colors.grey[400]),
      const SizedBox(height: 12),
      Text('Nessun appuntamento oggi',
        style: TextStyle(color: Colors.grey[600], fontSize: 15)),
    ]),
  );
}

class _AppointmentCard extends StatelessWidget {
  final Appointment appt;
  final VoidCallback onTap;
  const _AppointmentCard({required this.appt, required this.onTap});

  Color get _statusColor => switch (appt.status) {
    'completed'   => Colors.green,
    'in_progress' => Colors.orange,
    'cancelled'   => Colors.red,
    'missed'      => Colors.red[300]!,
    _             => AppTheme.primary,
  };

  @override
  Widget build(BuildContext context) {
    final tf = DateFormat('HH:mm');
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap:        onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            // Orario
            Container(
              width: 56, padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(children: [
                Text(tf.format(appt.scheduledStart),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppTheme.primary)),
                Text(tf.format(appt.scheduledEnd),
                  style: const TextStyle(fontSize: 11, color: Colors.grey)),
              ]),
            ),
            const SizedBox(width: 12),
            // Info
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(appt.beneficiaryName,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(appt.serviceName,
                  style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.location_on_outlined, size: 12, color: Colors.grey),
                  const SizedBox(width: 2),
                  Expanded(child: Text(appt.beneficiaryAddress,
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                    maxLines: 1, overflow: TextOverflow.ellipsis)),
                ]),
              ],
            )),
            // Status
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color:        _statusColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(appt.status, style: TextStyle(color: _statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
      ),
    );
  }
}

// ── Appointment Detail ──────────────────────────────────

class AppointmentDetailScreen extends ConsumerWidget {
  final String appointmentId;
  const AppointmentDetailScreen({required this.appointmentId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Trova l'appuntamento dalla lista
    final appts = ref.watch(appointmentsForDayProvider).valueOrNull ?? [];
    final appt  = appts.where((a) => a.id == appointmentId).firstOrNull;

    if (appt == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final tf   = DateFormat('HH:mm');
    final canCheckIn  = appt.status == 'scheduled' || appt.status == 'confirmed';
    final canCheckOut = appt.status == 'in_progress';
    final canNote     = appt.status == 'completed';

    return Scaffold(
      appBar: AppBar(title: Text(appt.beneficiaryName)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _InfoCard(icon: Icons.medical_services_outlined, title: 'Servizio', value: appt.serviceName),
          _InfoCard(icon: Icons.schedule,   title: 'Orario',
            value: '${tf.format(appt.scheduledStart)} – ${tf.format(appt.scheduledEnd)}'),
          _InfoCard(icon: Icons.location_on_outlined, title: 'Indirizzo', value: appt.beneficiaryAddress),
          const SizedBox(height: 24),

          // Azioni
          if (canCheckIn)
            _ActionButton(
              label: '📍 Check-In',
              color: Colors.green,
              onTap: () => context.go('/shifts/$appointmentId/checkin'),
            ),
          if (canCheckOut)
            _ActionButton(
              label: '🏁 Check-Out',
              color: AppTheme.primary,
              onTap: () => context.go(
                '/shifts/$appointmentId/checkout?attendanceId=ATTENDANCE_ID'),
            ),
          if (canNote)
            _ActionButton(
              label: '📝 Aggiungi Nota',
              color: AppTheme.secondary,
              onTap: () => context.go(
                '/shifts/$appointmentId/note?attendanceId=ATTENDANCE_ID'),
            ),
        ]),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon; final String title, value;
  const _InfoCard({required this.icon, required this.title, required this.value});
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      leading: Icon(icon, color: AppTheme.primary),
      title:   Text(title, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      subtitle:Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
    ),
  );
}

class _ActionButton extends StatelessWidget {
  final String label; final Color color; final VoidCallback onTap;
  const _ActionButton({required this.label, required this.color, required this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: SizedBox(width: double.infinity,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(backgroundColor: color),
        child: Text(label),
      ),
    ),
  );
}
