import pandas as pd
import pytest

from scripts.pophousing.calculations.rate_normalization import (
    find_decimal_fraction_rates,
    normalize_decimal_fraction_rates,
)


def _find_mask(dataframe):
    return find_decimal_fraction_rates(
        dataframe,
        year_col="Year",
        rate_col="Vacancy Rate (%)",
        level_col="Geographic Level",
        min_year=2020,
    )


def test_find_decimal_rates_detects_small_values():
    dataframe = pd.DataFrame(
        {"Year": [2022], "Vacancy Rate (%)": [0.05], "Geographic Level": ["City"]}
    )

    assert _find_mask(dataframe).tolist() == [True]


def test_find_decimal_rates_ignores_state_rows():
    dataframe = pd.DataFrame(
        {"Year": [2022], "Vacancy Rate (%)": [0.05], "Geographic Level": ["State"]}
    )

    assert _find_mask(dataframe).tolist() == [False]


def test_find_decimal_rates_ignores_old_years():
    dataframe = pd.DataFrame(
        {"Year": [2019], "Vacancy Rate (%)": [0.05], "Geographic Level": ["City"]}
    )

    assert _find_mask(dataframe).tolist() == [False]


@pytest.mark.parametrize("rate", [0.0, 1.0, 5.0])
def test_find_decimal_rates_boundary_values(rate):
    # 0.0 has no positive rate to judge; 1.0 and 5.0 read as valid percentages.
    dataframe = pd.DataFrame(
        {"Year": [2022], "Vacancy Rate (%)": [rate], "Geographic Level": ["City"]}
    )

    assert _find_mask(dataframe).tolist() == [False]


def test_find_decimal_rates_numeric_strings():
    dataframe = pd.DataFrame(
        {"Year": ["2022"], "Vacancy Rate (%)": ["0.05"], "Geographic Level": ["City"]}
    )

    assert _find_mask(dataframe).tolist() == [True]


def test_find_decimal_rates_preserves_genuine_sub1_in_percentage_vintage():
    # A real 0.4% vacancy inside an otherwise percent-encoded year must survive:
    # the vintage median is well above 1, so nothing in it is rescaled (B5).
    dataframe = pd.DataFrame(
        {
            "Year": [2022, 2022, 2022, 2022],
            "Vacancy Rate (%)": [0.4, 5.0, 7.5, 6.0],
            "Geographic Level": ["City", "City", "City", "County"],
        }
    )

    assert _find_mask(dataframe).tolist() == [False, False, False, False]


def test_find_decimal_rates_flags_whole_fraction_vintage():
    # Every rate in the year sits in the 0-1 band, so the vintage is fraction-encoded.
    dataframe = pd.DataFrame(
        {
            "Year": [2022, 2022, 2022],
            "Vacancy Rate (%)": [0.05, 0.07, 0.03],
            "Geographic Level": ["City", "City", "County"],
        }
    )

    assert _find_mask(dataframe).tolist() == [True, True, True]


def test_find_decimal_rates_vintages_decided_independently():
    # 2021 is fraction-encoded; 2022 is percent-encoded. Only 2021 is flagged.
    dataframe = pd.DataFrame(
        {
            "Year": [2021, 2021, 2022, 2022],
            "Vacancy Rate (%)": [0.05, 0.06, 5.0, 0.4],
            "Geographic Level": ["City", "City", "City", "City"],
        }
    )

    assert _find_mask(dataframe).tolist() == [True, True, False, False]


def test_normalize_decimal_rates_multiplies():
    dataframe = pd.DataFrame({"Vacancy Rate (%)": [0.05]})

    result = normalize_decimal_fraction_rates(
        dataframe, "Vacancy Rate (%)", pd.Series([True])
    )

    assert result["Vacancy Rate (%)"].tolist() == [5.0]


def test_normalize_decimal_rates_rounds():
    dataframe = pd.DataFrame({"Vacancy Rate (%)": [0.05678]})

    result = normalize_decimal_fraction_rates(
        dataframe, "Vacancy Rate (%)", pd.Series([True])
    )

    assert result["Vacancy Rate (%)"].tolist() == [5.68]


def test_normalize_decimal_rates_only_masked_rows():
    dataframe = pd.DataFrame({"Vacancy Rate (%)": [0.05, 7.5]})

    result = normalize_decimal_fraction_rates(
        dataframe, "Vacancy Rate (%)", pd.Series([True, False])
    )

    assert result["Vacancy Rate (%)"].tolist() == [5.0, 7.5]


def test_normalize_decimal_rates_preserves_other_columns():
    dataframe = pd.DataFrame(
        {"Vacancy Rate (%)": [0.05], "Location": ["Oakland"]}
    )

    result = normalize_decimal_fraction_rates(
        dataframe, "Vacancy Rate (%)", pd.Series([True])
    )

    assert result["Location"].tolist() == ["Oakland"]


def test_normalize_decimal_rates_does_not_mutate_input():
    dataframe = pd.DataFrame({"Vacancy Rate (%)": [0.05]})

    normalize_decimal_fraction_rates(
        dataframe, "Vacancy Rate (%)", pd.Series([True])
    )

    assert dataframe["Vacancy Rate (%)"].tolist() == [0.05]


def test_normalize_decimal_rates_mask_alignment():
    dataframe = pd.DataFrame({"Vacancy Rate (%)": [0.05]}, index=[2])

    with pytest.raises(ValueError, match="mask must align"):
        normalize_decimal_fraction_rates(
            dataframe,
            "Vacancy Rate (%)",
            pd.Series([True], index=[0]),
        )
