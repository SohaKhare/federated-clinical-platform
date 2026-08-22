"""Hospital data partitioning package for the Federated Clinical Platform."""

from federated.partitioning.hospital_partition import (
    HOSPITAL_NAMES,
    create_hospital_partitions,
    load_hospital_data,
    save_hospital_partitions,
)

__all__ = [
    "HOSPITAL_NAMES",
    "create_hospital_partitions",
    "save_hospital_partitions",
    "load_hospital_data",
]
