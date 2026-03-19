// lib/features/shifts/presentation/shifts_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';

class Shift {
  final String id, operatorId, startTime, endTime, shiftType;
  final DateTime shiftDate;
  final int appointmentsCount;
  const Shift({required this.id, required this.operatorId, required this.shiftDate,
    required this.startTime, required this.endTime, required this.shiftType,
    this.appointmentsCount = 0});
  factory Shift.fromJson(Map<String, dynamic> j) => Shift(
    id: j['id'] as String, operatorId: j['operatorId'] as String,
    shiftDate: DateTime.parse(j['shiftDate'] as String),
    startTime: j['startTime'] as String, endTime: j['endTime'] as String,
    shiftType: j['shiftType'] as String,
    appointmentsCount: (j['appointments_count'] as int?) ?? 0,
  );
}

class Appointment {
  final String id, status, serviceName, beneficiaryName, beneficiaryAddress;
  final DateTime scheduledStart, scheduledEnd;
  const Appointment({required this.id, required this.status,
    required this.serviceName, required this.beneficiaryName,
    required this.beneficiaryAddress, required this.scheduledStart, required this.scheduledEnd});
  factory Appointment.fromJson(Map<String, dynamic> j) {
    final cp = (j['carePlan'] as Map?) ?? {};
    final b  = (cp['beneficiary'] as Map?) ?? {};
    final st = (j['serviceType'] as Map?) ?? {};
    return Appointment(
      id: j['id'] as String, status: j['status'] as String,
      serviceName:       st['name'] as String? ?? '',
      beneficiaryName:   '${b['firstName'] ?? ''} ${b['lastName'] ?? ''}'.trim(),
      beneficiaryAddress:b['address'] as String? ?? '',
      scheduledStart: DateTime.parse(j['scheduledStart'] as String),
      scheduledEnd:   DateTime.parse(j['scheduledEnd']   as String),
    );
  }
}

// Giorno selezionato
final selectedDateProvider = StateProvider<DateTime>((_) => DateTime.now());

// Turni del mese
final shiftsProvider = FutureProvider<List<Shift>>((ref) async {
  final dio  = ref.read(apiClientProvider);
  final now  = DateTime.now();
  final from = DateTime(now.year, now.month, 1);
  final to   = DateTime(now.year, now.month + 1, 0);
  final res  = await dio.get('/api/v1/shifts/mine', queryParameters: {
    'from': DateFormat('yyyy-MM-dd').format(from),
    'to':   DateFormat('yyyy-MM-dd').format(to),
  });
  final list = res.data['shifts'] as List;
  return list.map((e) => Shift.fromJson(e as Map<String, dynamic>)).toList();
});

// Appuntamenti del giorno selezionato
final appointmentsForDayProvider = FutureProvider<List<Appointment>>((ref) async {
  final date = ref.watch(selectedDateProvider);
  final dio  = ref.read(apiClientProvider);
  final res  = await dio.get('/api/v1/appointments', queryParameters: {
    'operator_id': 'mine',
    'date': DateFormat('yyyy-MM-dd').format(date),
  });
  final list = (res.data['data'] as List?) ?? [];
  return list.map((e) => Appointment.fromJson(e as Map<String, dynamic>)).toList();
});
