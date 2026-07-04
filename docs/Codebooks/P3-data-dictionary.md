---
Topic: Population
Content Type: codebook
pinned: false
description: "Data dictionary for the California Department of Finance P3 population projections (2020–2070, Baseline 2024, Vintage 2026), covering file format and field definitions. Serves as the codebook for the projections dataset."
Date Published: June 30, 2026
Last Updated: 06/30/2026 - 05:43 PM
---

# Population Projections Data Dictionary: 2020--2070
Baseline 2024.
Vintage 2026. 
California Department of Finance. March 2026.

## File format
* Compressed format: .zip
* Comma delimited ASCII text records
* First line contains variable names
* One population per record/line
* CR+LF line delimiters
* Zero populations are included (dataset is rectangular)

Index	Variable name	Values	Data Type (Max. Length) Contents
1	fips	{6001,...,6115}	Numeric (4)	FIPS county identifiers (fips code increases by 2 for a total of 58 counties)
2	year	{2020,...,2070} Numeric (4)	Projection year (day: July 1)
3	sex	{MALE,FEMALE}   String 	(6)	Recoded sex 
4	race7	{1,2,3,4,5,6,7} Numeric (1)	Recoded race/ethnicity
5	agerc	{0,...,110}	Numeric (3)	Recoded exact age (completed years)
6	perwt	{0,...,47530}   Numeric (5)	Population count

Codebook
IndexVariable name  Values  Value Label
1	fips
			6001	Alameda County
			6003	Alpine County
			6005	Amador County
			6007	Butte County
			6009	Calaveras County
			6011	Colusa County
			6013	Contra Costa County
			6015	Del Norte County
			6017	El Dorado County
			6019	Fresno County
			6021	Glenn County
			6023	Humboldt County
			6025	Imperial County	
			6027	Inyo County
			6029	Kern County
			6031	Kings County
			6033	Lake County
			6035	Lassen County
			6037	Los Angeles County
			6039	Madera County
			6041	Marin County
			6043	Mariposa County
			6045	Mendocino County
			6047	Merced County
			6049	Modoc County
			6051	Mono County
			6053	Monterey County
			6055	Napa County
			6057	Nevada County
			6059	Orange County
			6061	Placer County
			6063	Plumas County
			6065	Riverside County
			6067	Sacramento County
			6069	San Benito County
			6071	San Bernardino County
			6073	San Diego County
			6075	San Francisco County
			6077	San Joaquin County
			6079	San Luis Obispo County
			6081	San Mateo County
			6083	Santa Barbara County
			6085	Santa Clara County
			6087	Santa Cruz County
			6089	Shasta County
			6091	Sierra County
			6093	Siskiyou County
			6095	Solano County
			6097	Sonoma County
			6099	Stanislaus County
			6101	Sutter County
			6103	Tehama County
			6105	Trinity County
			6107	Tulare County
			6109	Tuolumne County
			6111	Ventura County
			6113	Yolo County
			6115	Yuba County
2	year
			2020	July 1, 2020
			2021	July 1, 2021
			2022	July 1, 2022
			2023	July 1, 2023
			2024	July 1, 2024
			2025	July 1, 2025
			2026	July 1, 2026
			2027	July 1, 2027
			2028	July 1, 2028
			2029	July 1, 2029
			2030	July 1, 2030
			2031	July 1, 2031
			2032	July 1, 2032
			2033	July 1, 2033
			2034	July 1, 2034
			2035	July 1, 2035
			2036	July 1, 2036
			2037	July 1, 2037
			2038	July 1, 2038
			2039	July 1, 2039
			2040	July 1, 2040
			2041	July 1, 2041
			2042	July 1, 2042
			2043	July 1, 2043
			2044	July 1, 2044
			2045	July 1, 2045
			2046	July 1, 2046
			2047	July 1, 2047
			2048	July 1, 2048
			2049	July 1, 2049
			2050	July 1, 2050
			2051	July 1, 2051
			2052	July 1, 2052
			2053	July 1, 2053
			2054	July 1, 2054
			2055	July 1, 2055
			2056	July 1, 2056
			2057	July 1, 2057
			2058	July 1, 2058
			2059	July 1, 2059
			2060	July 1, 2060
			2061	July 1, 2061
			2062	July 1, 2062
			2063	July 1, 2063
			2064	July 1, 2064
			2065	July 1, 2065
			2066	July 1, 2066
			2067	July 1, 2067
			2068	July 1, 2068
			2069	July 1, 2069
			2070	July 1, 2070
3	sex
			FEMALE	Female
			MALE	Male
4	race7
			1	White, Non-Hispanic
			2	Black, Non-Hispanic
			3	American Indian or Alaska Native, Non-Hispanic
			4	Asian, Non-Hispanic
			5	Native Hawaiian or Pacific Islander, Non-Hispanic
			6	Multiracial (two or more of above races), Non-Hispanic
			7	Hispanic (any race)
5a	gerc
			0	Age <1 year
			1	Age 1
			2	Age 2
			3	Age 3
			4	Age 4
			5	Age 5
			6	Age 6
			7	Age 7
			8	Age 8
			9	Age 9
			10	Age 10
			11	Age 11
			12	Age 12
			13	Age 13
			14	Age 14
			15	Age 15
			16	Age 16
			17	Age 17
			18	Age 18
			19	Age 19
			20	Age 20
			21	Age 21
			22	Age 22
			23	Age 23
			24	Age 24
			25	Age 25
			26	Age 26
			27	Age 27
			28	Age 28
			29	Age 29
			30	Age 30
			31	Age 31
			32	Age 32
			33	Age 33
			34	Age 34
			35	Age 35
			36	Age 36
			37	Age 37
			38	Age 38
			39	Age 39
			40	Age 40
			41	Age 41
			42	Age 42
			43	Age 43
			44	Age 44
			45	Age 45
			46	Age 46
			47	Age 47
			48	Age 48
			49	Age 49
			50	Age 50
			51	Age 51
			52	Age 52
			53	Age 53
			54	Age 54
			55	Age 55
			56	Age 56
			57	Age 57
			58	Age 58
			59	Age 59
			60	Age 60
			61	Age 61
			62	Age 62
			63	Age 63
			64	Age 64
			65	Age 65
			66	Age 66
			67	Age 67
			68	Age 68
			69	Age 69
			70	Age 70
			71	Age 71
			72	Age 72
			73	Age 73
			74	Age 74
			75	Age 75
			76	Age 76
			77	Age 77
			78	Age 78
			79	Age 79
			80	Age 80
			81	Age 81
			82	Age 82
			83	Age 83
			84	Age 84
			85	Age 85
			86	Age 86
			87	Age 87
			88	Age 88
			89	Age 89
			90	Age 90
			91	Age 91
			92	Age 92
			93	Age 93
			94	Age 94
			95	Age 95
			96	Age 96
			97	Age 97
			98	Age 98
			99	Age 99
			100	Age 100
			101	Age 101  
			102	Age 102
			103	Age 103
			104	Age 104
			105	Age 105
			106	Age 106
			107	Age 107
			108	Age 108
			109	Age 109
			110	Age 110 years and older