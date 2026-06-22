import pandas as pd
import pytest


@pytest.fixture
def generic_dataframe():
    return pd.DataFrame({"a": [1, 2], "b": [3, 4]})
