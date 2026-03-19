// lib/features/attendance/presentation/checkin_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import 'attendance_provider.dart';

class CheckInScreen extends ConsumerWidget {
  final String appointmentId;
  const CheckInScreen({required this.appointmentId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state    = ref.watch(attendanceProvider);
    final notifier = ref.read(attendanceProvider.notifier);

    ref.listen(attendanceProvider, (_, next) {
      if (next.valueOrNull is AttendanceCheckedIn) {
        final s = next.value! as AttendanceCheckedIn;
        // Naviga al checkout screen passando attendanceId
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(s.geofenceOk
            ? '✅ Check-in verificato (${s.distanceMeters ?? "?"}m)'
            : '⚠️ Check-in registrato ma fuori dal geofence'),
          backgroundColor: s.geofenceOk ? Colors.green : Colors.orange,
        ));
        context.go(
          '/shifts/$appointmentId/checkout?attendanceId=${s.attendanceId}');
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Check-In')),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(children: [
          const Spacer(),
          // Icona animata
          Container(
            width: 140, height: 140,
            decoration: BoxDecoration(
              color:  AppTheme.secondary.withOpacity(0.1),
              shape:  BoxShape.circle,
              border: Border.all(color: AppTheme.secondary, width: 3),
            ),
            child: const Icon(Icons.location_on_rounded,
              size: 72, color: AppTheme.secondary),
          ),
          const SizedBox(height: 24),
          const Text('Sei arrivato/a?',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('Premi il pulsante per registrare la tua presenza.\nVerrà acquisita la tua posizione GPS.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[600])),
          const Spacer(),
          // Pulsante
          state.when(
            loading: () => const CircularProgressIndicator(),
            error: (e, _) => Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Errore: $e', style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => notifier.checkIn(appointmentId),
                child: const Text('Riprova'),
              ),
            ]),
            data: (_) => SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: () => notifier.checkIn(appointmentId),
                icon:  const Icon(Icons.check_circle_outline, size: 24),
                label: const Text('Registra Check-In', style: TextStyle(fontSize: 16)),
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.secondary),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ]),
      ),
    );
  }
}

// ── Checkout Screen ─────────────────────────────────────

class CheckOutScreen extends ConsumerWidget {
  final String attendanceId, appointmentId;
  const CheckOutScreen({required this.attendanceId, required this.appointmentId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state    = ref.watch(attendanceProvider);
    final notifier = ref.read(attendanceProvider.notifier);

    ref.listen(attendanceProvider, (_, next) {
      if (next.valueOrNull is AttendanceCheckedOut) {
        final s = next.value! as AttendanceCheckedOut;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ Check-out registrato. Durata: ${s.durationMin} minuti'),
          backgroundColor: Colors.green,
        ));
        // Vai alla nota
        context.go('/shifts/$appointmentId/note?attendanceId=$attendanceId');
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Check-Out')),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(children: [
          const Spacer(),
          Container(
            width: 140, height: 140,
            decoration: BoxDecoration(
              color:  AppTheme.primary.withOpacity(0.1),
              shape:  BoxShape.circle,
              border: Border.all(color: AppTheme.primary, width: 3),
            ),
            child: const Icon(Icons.flag_rounded, size: 72, color: AppTheme.primary),
          ),
          const SizedBox(height: 24),
          const Text('Visita terminata?',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('Registra l\'uscita per completare la visita.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[600])),
          const Spacer(),
          state.when(
            loading: () => const CircularProgressIndicator(),
            error:   (e, _) => Text('Errore: $e', style: const TextStyle(color: Colors.red)),
            data:    (_) => SizedBox(
              width: double.infinity, height: 56,
              child: ElevatedButton.icon(
                onPressed: () => notifier.checkOut(attendanceId),
                icon:  const Icon(Icons.logout, size: 24),
                label: const Text('Registra Check-Out', style: TextStyle(fontSize: 16)),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ]),
      ),
    );
  }
}

// ── Note Screen ─────────────────────────────────────────

class NoteScreen extends ConsumerStatefulWidget {
  final String attendanceId;
  const NoteScreen({required this.attendanceId, super.key});
  @override
  ConsumerState<NoteScreen> createState() => _NoteScreenState();
}

class _NoteScreenState extends ConsumerState<NoteScreen> {
  final _noteCtrl  = TextEditingController();
  int?  _painScale;
  final _systolicCtrl  = TextEditingController();
  final _diastolicCtrl = TextEditingController();
  final _hrCtrl        = TextEditingController();
  final _tempCtrl      = TextEditingController();
  final _alerts        = <String>[];
  final _alertCtrl     = TextEditingController();

  @override
  void dispose() {
    _noteCtrl.dispose(); _systolicCtrl.dispose(); _diastolicCtrl.dispose();
    _hrCtrl.dispose(); _tempCtrl.dispose(); _alertCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_noteCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('La nota non può essere vuota')));
      return;
    }
    final vs = <String, dynamic>{};
    if (_systolicCtrl.text.isNotEmpty)  vs['bp_systolic']  = int.tryParse(_systolicCtrl.text);
    if (_diastolicCtrl.text.isNotEmpty) vs['bp_diastolic'] = int.tryParse(_diastolicCtrl.text);
    if (_hrCtrl.text.isNotEmpty)        vs['heart_rate']   = int.tryParse(_hrCtrl.text);
    if (_tempCtrl.text.isNotEmpty)      vs['temperature']  = double.tryParse(_tempCtrl.text);

    await ref.read(attendanceProvider.notifier).submitNote(
      attendanceId: widget.attendanceId,
      noteText:     _noteCtrl.text.trim(),
      vitalSigns:   vs.isNotEmpty ? vs : null,
      painScale:    _painScale,
      alerts:       _alerts,
    );
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(attendanceProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Nota di servizio'),
        actions: [TextButton(onPressed: isLoading ? null : _submit,
          child: const Text('Salva', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)))]),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // Nota libera
          const Text('Nota', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          TextField(
            controller:  _noteCtrl,
            maxLines:    5,
            decoration:  const InputDecoration(
              hintText: 'Descrivi la visita, l\'andamento del paziente...',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),

          // Parametri vitali
          const Text('Parametri vitali (opzionale)', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: _systolicCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Sist.', suffix: Text('mmHg')))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _diastolicCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Diast.', suffix: Text('mmHg')))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _hrCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'FC', suffix: Text('bpm')))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _tempCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Temp.', suffix: Text('°C')))),
          ]),
          const SizedBox(height: 20),

          // Scala del dolore
          const Text('Scala del dolore NRS (0–10)', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: List.generate(11, (i) => ChoiceChip(
            label:    Text('$i'),
            selected: _painScale == i,
            onSelected: (_) => setState(() => _painScale = i),
            selectedColor: i >= 7 ? Colors.red[100] : Colors.green[100],
          ))),
          const SizedBox(height: 20),

          // Alert
          const Text('Segnalazioni', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: _alertCtrl,
              decoration: const InputDecoration(hintText: 'Es: lieve dispnea'))),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.add_circle, color: AppTheme.primary),
              onPressed: () {
                if (_alertCtrl.text.trim().isNotEmpty) {
                  setState(() { _alerts.add(_alertCtrl.text.trim()); _alertCtrl.clear(); });
                }
              },
            ),
          ]),
          ..._alerts.map((a) => ListTile(
            dense: true, contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.warning_amber, color: Colors.orange, size: 20),
            title: Text(a),
            trailing: IconButton(
              icon: const Icon(Icons.remove_circle_outline, size: 18),
              onPressed: () => setState(() => _alerts.remove(a)),
            ),
          )),

          const SizedBox(height: 32),
          if (isLoading) const Center(child: CircularProgressIndicator()),
        ]),
      ),
    );
  }
}
