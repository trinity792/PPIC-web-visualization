// Hand-authored acceptance expectations for the dataset-range plan.
// Range uses the existing registry id "dumbbell". Lists apply only to multi-value roles.
// Explicit corpus examples resolve the unique-label/two-number ranking overlap as scatter.
export const expectations = [
  {
    "id": "wide-monthly-shares",
    "columns": [
      {
        "name": "Date",
        "type": "date"
      },
      {
        "name": "Chrome",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "IE",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "Firefox",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "Safari",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "Edge",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "Other",
        "type": "number",
        "unit": "percent"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "Date",
      "y": [
        "Chrome",
        "IE",
        "Firefox",
        "Safari",
        "Edge",
        "Other"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Chrome, IE, Firefox, and 3 more over time",
      "xAxis": "Date",
      "yAxis": "Percent"
    }
  },
  {
    "id": "long-monthly-shares",
    "columns": [
      {
        "name": "Date",
        "type": "date"
      },
      {
        "name": "Browser",
        "type": "text"
      },
      {
        "name": "Share",
        "type": "number",
        "unit": "percent"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "Date",
      "series": "Browser",
      "y": "Share"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Share over time",
      "xAxis": "Date",
      "yAxis": "Share"
    }
  },
  {
    "id": "years-across-columns",
    "columns": [
      {
        "name": "Location",
        "type": "text"
      },
      {
        "name": "2019",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2020",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2021",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2022",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2023",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2024",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "line",
    "bindings": {
      "series": "Location",
      "y": [
        "2019",
        "2020",
        "2021",
        "2022",
        "2023",
        "2024"
      ],
      "valuesArePeriods": true
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "2019, 2020, 2021, and 3 more over time",
      "xAxis": "Period",
      "yAxis": "Number"
    }
  },
  {
    "id": "two-period-columns",
    "columns": [
      {
        "name": "County",
        "type": "text"
      },
      {
        "name": "2010",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "2020",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "dumbbell",
    "bindings": {
      "category": "County",
      "start": "2010",
      "end": "2020"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "2010 by County",
      "xAxis": "2010",
      "yAxis": "County"
    }
  },
  {
    "id": "interval-columns",
    "columns": [
      {
        "name": "Study",
        "type": "text"
      },
      {
        "name": "Estimate",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Lower",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Upper",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "forest",
    "bindings": {
      "category": "Study",
      "point": "Estimate",
      "start": "Lower",
      "end": "Upper"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Estimate by Study",
      "xAxis": "Estimate",
      "yAxis": "Study"
    }
  },
  {
    "id": "low-high-columns",
    "columns": [
      {
        "name": "Occupation",
        "type": "text"
      },
      {
        "name": "Low",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "High",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "dumbbell",
    "bindings": {
      "category": "Occupation",
      "start": "Low",
      "end": "High"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Low by Occupation",
      "xAxis": "Low",
      "yAxis": "Occupation"
    }
  },
  {
    "id": "two-labels-shares",
    "columns": [
      {
        "name": "Job",
        "type": "text"
      },
      {
        "name": "Nation",
        "type": "text"
      },
      {
        "name": "I typically tip",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "I do not typically tip, but I might sometimes tip",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "Don't know",
        "type": "number",
        "unit": "percent"
      },
      {
        "name": "I never tip",
        "type": "number",
        "unit": "percent"
      }
    ],
    "chartType": "bar",
    "bindings": {
      "category": "Nation",
      "y": [
        "I typically tip",
        "I do not typically tip, but I might sometimes tip",
        "Don't know",
        "I never tip"
      ]
    },
    "appearance": {
      "orientation": "horizontal",
      "stackMode": "percent",
      "sort": "descending"
    },
    "warnings": [
      "inlineRowsShareMapping"
    ],
    "labels": {
      "title": "I typically tip, I do not typically tip, but I might sometimes tip, Don't know, and 1 more by Nation",
      "xAxis": "Percent",
      "yAxis": "Nation"
    }
  },
  {
    "id": "one-label-several-values",
    "columns": [
      {
        "name": "Region",
        "type": "text"
      },
      {
        "name": "Homes",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Jobs",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Schools",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "bar",
    "bindings": {
      "category": "Region",
      "y": [
        "Homes",
        "Jobs",
        "Schools"
      ]
    },
    "appearance": {
      "stackMode": "none"
    },
    "warnings": [],
    "labels": {
      "title": "Homes, Jobs, and Schools by Region",
      "xAxis": "Region",
      "yAxis": "Number"
    }
  },
  {
    "id": "one-label-one-value",
    "columns": [
      {
        "name": "Nation",
        "type": "text"
      },
      {
        "name": "Count",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "bar",
    "bindings": {
      "category": "Nation",
      "y": [
        "Count"
      ]
    },
    "appearance": {
      "orientation": "horizontal"
    },
    "warnings": [],
    "labels": {
      "title": "Count by Nation",
      "xAxis": "Count",
      "yAxis": "Nation"
    }
  },
  {
    "id": "two-labels-grid",
    "columns": [
      {
        "name": "Age group",
        "type": "text"
      },
      {
        "name": "Region",
        "type": "text"
      },
      {
        "name": "Count",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "heatmap",
    "bindings": {
      "x": "Age group",
      "y": "Region",
      "color": "Count"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Count by Region",
      "xAxis": "Age group",
      "yAxis": "Region"
    }
  },
  {
    "id": "two-labels-sparse",
    "columns": [
      {
        "name": "Age group",
        "type": "text"
      },
      {
        "name": "Region",
        "type": "text"
      },
      {
        "name": "Count",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "dotPlot",
    "bindings": {
      "y": "Age group",
      "x": "Region",
      "color": [
        "Count"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Count by Age group",
      "xAxis": "Count",
      "yAxis": "Age group"
    }
  },
  {
    "id": "two-numbers",
    "columns": [
      {
        "name": "Name",
        "type": "text"
      },
      {
        "name": "Income",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Rent",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "scatter",
    "bindings": {
      "unit": "Name",
      "x": "Income",
      "y": "Rent"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Rent by Name",
      "xAxis": "Income",
      "yAxis": "Rent"
    }
  },
  {
    "id": "quarterly",
    "columns": [
      {
        "name": "Quarter",
        "type": "date"
      },
      {
        "name": "Sales",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Costs",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "Quarter",
      "y": [
        "Sales",
        "Costs"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Sales and Costs over time",
      "xAxis": "Quarter",
      "yAxis": "Number"
    }
  },
  {
    "id": "school-years",
    "columns": [
      {
        "name": "School year",
        "type": "date"
      },
      {
        "name": "Enrollment",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "School year",
      "y": [
        "Enrollment"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Enrollment over time",
      "xAxis": "School year",
      "yAxis": "Enrollment"
    }
  },
  {
    "id": "irregular-dates",
    "columns": [
      {
        "name": "Survey date",
        "type": "date"
      },
      {
        "name": "Responses",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "Survey date",
      "y": [
        "Responses"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Responses over time",
      "xAxis": "Survey date",
      "yAxis": "Responses"
    }
  },
  {
    "id": "month-names",
    "columns": [
      {
        "name": "Month",
        "type": "date"
      },
      {
        "name": "Sales",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "line",
    "bindings": {
      "x": "Month",
      "y": [
        "Sales"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Sales over time",
      "xAxis": "Month",
      "yAxis": "Sales"
    }
  },
  {
    "id": "messy-export",
    "columns": [
      {
        "name": "Region - Name",
        "type": "text"
      },
      {
        "name": "Employment - Jobs",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Employment - Vacancies",
        "type": "number",
        "unit": "number"
      },
      {
        "name": "Employment - Positions",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "bar",
    "bindings": {
      "category": "Region - Name",
      "y": [
        "Employment - Jobs",
        "Employment - Vacancies",
        "Employment - Positions"
      ]
    },
    "appearance": {
      "stackMode": "none"
    },
    "warnings": [],
    "labels": {
      "title": "Regional employment",
      "xAxis": "Region - Name",
      "yAxis": "Number"
    }
  },
  {
    "id": "decimal-comma",
    "columns": [
      {
        "name": "Region",
        "type": "text"
      },
      {
        "name": "Amount",
        "type": "number",
        "unit": "number"
      }
    ],
    "chartType": "bar",
    "bindings": {
      "category": "Region",
      "y": [
        "Amount"
      ]
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Amount by Region",
      "xAxis": "Region",
      "yAxis": "Amount"
    }
  },
  {
    "id": "currency-percent-strings",
    "columns": [
      {
        "name": "Name",
        "type": "text"
      },
      {
        "name": "Income",
        "type": "number",
        "unit": "usd"
      },
      {
        "name": "Share",
        "type": "number",
        "unit": "percent"
      }
    ],
    "chartType": "scatter",
    "bindings": {
      "unit": "Name",
      "x": "Income",
      "y": "Share"
    },
    "appearance": {},
    "warnings": [],
    "labels": {
      "title": "Share by Name",
      "xAxis": "Income",
      "yAxis": "Share"
    }
  }
];
