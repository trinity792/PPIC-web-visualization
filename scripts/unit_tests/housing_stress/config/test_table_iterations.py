from scripts.housing_stress.config import table_iterations
from scripts.housing_stress.config.schemas import get_schema_config
from scripts.housing_stress.config.sources import get_source_settings


def test_base_table_is_first_iteration():
    assert list(table_iterations.table_iterations())[0] == table_iterations.BASE_TABLE_ID


def test_maps_share_a_single_owner_and_do_not_drift():
    raw = table_iterations.table_iterations()
    canonical = table_iterations.race_iteration_map()
    reconciliation = table_iterations.race_reconciliation_map()

    # Every table id appears in both maps, and the reconciliation bridge maps each
    # raw label to the same canonical label the id map assigns.
    assert set(raw) == set(canonical)
    for tblid, raw_label in raw.items():
        assert reconciliation[raw_label] == canonical[tblid]


def test_sources_and_schemas_derive_from_the_single_owner():
    source_settings = get_source_settings()
    schema_config = get_schema_config()

    assert source_settings["table_iterations"] == table_iterations.table_iterations()
    assert source_settings["base_table_id"] == table_iterations.BASE_TABLE_ID
    assert schema_config["race_iteration_map"] == table_iterations.race_iteration_map()
    assert schema_config["race_reconciliation_map"] == table_iterations.race_reconciliation_map()


def test_schema_exposes_explicit_region_id_map():
    schema_config = get_schema_config()
    region_id_to_name = schema_config["region_id_to_name"]

    # Keyed by the crosswalk's numeric ids 1..9, order-independent literal.
    assert set(region_id_to_name) == set(range(1, 10))
    assert region_id_to_name[2] == "Bay Area"
