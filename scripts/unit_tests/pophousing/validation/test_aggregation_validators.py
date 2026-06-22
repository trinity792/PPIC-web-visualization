import pandas as pd

from scripts.pophousing.validation.aggregation_validators import (
    validate_normalized_housing_rates,
)


def _validate(rates, years=None, levels=None):
    row_count = len(rates)
    dataframe = pd.DataFrame(
        {
            "Year": years or [2022] * row_count,
            "Vacancy Rate (%)": rates,
            "Geographic Level": levels or ["City"] * row_count,
        }
    )
    return validate_normalized_housing_rates(
        dataframe, "Year", "Vacancy Rate (%)", "Geographic Level"
    )


def test_validate_rates_all_plausible():
    assert _validate([0, 1, 5, 100]) == (True, [])


def test_validate_rates_negative_rate():
    is_valid, messages = _validate([-1])

    assert is_valid is False and any("outside 0 to 100" in message for message in messages)


def test_validate_rates_over_100():
    is_valid, messages = _validate([101])

    assert is_valid is False and any("outside 0 to 100" in message for message in messages)


def test_validate_rates_suspicious_decimal():
    is_valid, messages = _validate([0.05])

    assert is_valid is False and any("decimal fractions" in message for message in messages)


def test_validate_rates_null_rates_ok():
    assert _validate([None]) == (True, [])


def test_validate_rates_ignores_state_decimal():
    assert _validate([0.05], levels=["State"]) == (True, [])
