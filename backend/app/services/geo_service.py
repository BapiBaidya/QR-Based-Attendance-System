import math
from typing import Tuple


def haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """
    Calculate the great-circle distance between two points on the Earth
    using the Haversine formula.
    
    Returns:
        Distance in meters (float).
    """
    # Earth radius in meters
    R = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance_meters = R * c
    return round(distance_meters, 2)


def is_within_geofence(
    student_lat: float,
    student_lon: float,
    classroom_lat: float,
    classroom_lon: float,
    allowed_radius_meters: int,
    accuracy_tolerance_meters: float = 15.0,
) -> Tuple[bool, float]:
    """
    Validates whether the student's reported GPS coordinates fall within
    the classroom perimeter plus an optional GPS noise/accuracy tolerance.
    
    Returns:
        (is_valid: bool, distance_meters: float)
    """
    distance = haversine_distance(
        student_lat, student_lon, classroom_lat, classroom_lon
    )
    max_allowed = allowed_radius_meters + accuracy_tolerance_meters
    return distance <= max_allowed, distance
