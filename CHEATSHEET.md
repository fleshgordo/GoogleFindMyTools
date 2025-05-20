# Use query parameters (only works with pr-35) and parse directly into script to generate csv file

```bash
python main.py -q "moto1" | python parser_json.py moto1.csv
```


