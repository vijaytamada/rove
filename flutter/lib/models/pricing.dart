/// The rates for a scooter in a city (or the ones a booking was made with). Amounts are integer paise.
class PricingView {
  const PricingView({
    required this.hourlyRateAmount,
    required this.includedKmPerHour,
    required this.extraKmRateAmount,
    required this.graceMinutes,
    required this.lateFeePerHourAmount,
    required this.depositAmount,
    this.dailyRateAmount,
  });

  final int hourlyRateAmount;

  /// When set, a long rental never costs more than this.
  final int? dailyRateAmount;
  final int includedKmPerHour;
  final int extraKmRateAmount;
  final int graceMinutes;
  final int lateFeePerHourAmount;
  final int depositAmount;

  factory PricingView.fromJson(Map<String, dynamic> json) => PricingView(
        hourlyRateAmount: (json['hourlyRateAmount'] as num).toInt(),
        dailyRateAmount: (json['dailyRateAmount'] as num?)?.toInt(),
        includedKmPerHour: (json['includedKmPerHour'] as num).toInt(),
        extraKmRateAmount: (json['extraKmRateAmount'] as num).toInt(),
        graceMinutes: (json['graceMinutes'] as num).toInt(),
        lateFeePerHourAmount: (json['lateFeePerHourAmount'] as num).toInt(),
        depositAmount: (json['depositAmount'] as num).toInt(),
      );
}
