enum Role { superAdmin, cityManager, stationEmployee, customer }

Role _roleFrom(String value) => switch (value) {
      'SUPER_ADMIN' => Role.superAdmin,
      'CITY_MANAGER' => Role.cityManager,
      'STATION_EMPLOYEE' => Role.stationEmployee,
      _ => Role.customer,
    };

extension RoleLabel on Role {
  String get label => switch (this) {
        Role.superAdmin => 'Super admin',
        Role.cityManager => 'City manager',
        Role.stationEmployee => 'Station employee',
        Role.customer => 'Customer',
      };
}

class UserView {
  const UserView({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.phoneVerified,
    this.phone,
  });

  final String id;
  final String email;
  final String fullName;
  final Role role;
  final String? phone;
  final bool phoneVerified;

  factory UserView.fromJson(Map<String, dynamic> json) => UserView(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        role: _roleFrom(json['role'] as String),
        phone: json['phone'] as String?,
        phoneVerified: json['phoneVerified'] as bool? ?? false,
      );

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }
}
