# Underdog ADP Scraper

Python scripts to scrape Average Draft Position (ADP) data from DraftSharks Underdog Fantasy.

## Files

1. **scrape_adp.py** - Basic scraper using requests + BeautifulSoup
2. **scrape_adp_enhanced.py** - Enhanced scraper with Selenium support for dynamic content

## Requirements

### Basic Version
```bash
pip install requests beautifulsoup4
```

### Enhanced Version (recommended)
```bash
pip install requests beautifulsoup4 selenium
```

You'll also need Chrome browser and ChromeDriver for Selenium:
- Download ChromeDriver: https://chromedriver.chromium.org/downloads
- Match your Chrome browser version
- Add ChromeDriver to your PATH

## Usage

### Basic Version
```bash
python scrape_adp.py
```

### Enhanced Version (recommended)
```bash
python scrape_adp_enhanced.py
```

## Output

Both scripts will create a CSV file named `underdog_adp.csv` containing:
- Player names
- Positions
- Teams
- ADP values
- Other relevant fantasy football statistics

## Example Output

```csv
Rank,Player,Position,Team,ADP,Change
1,Christian McCaffrey,RB,SF,1.2,0
2,CeeDee Lamb,WR,DAL,2.5,+1
3,Tyreek Hill,WR,MIA,3.1,-1
...
```

## Troubleshooting

### Script returns no data
- The website might use JavaScript to load content (use enhanced version)
- Website structure may have changed (inspect with browser DevTools)
- Network connectivity issues

### Selenium errors
- Make sure Chrome and ChromeDriver versions match
- Verify ChromeDriver is in your PATH
- Try running with `--headless=false` to see what's happening

### Permission errors
- Ensure you have write permissions in the directory
- Try running from a different location

## Customization

You can modify the scripts to:
- Change output filename (edit `filename` parameter in `save_to_csv()`)
- Add data filtering or transformation
- Scrape additional pages or data points
- Export to different formats (JSON, Excel, etc.)

## Legal & Ethical Considerations

- Respect the website's robots.txt file
- Don't overload the server with requests
- Use responsibly and for personal use only
- Check the website's Terms of Service

## Notes

- Data is scraped as-is from the website
- ADP values are updated regularly by DraftSharks
- Script may need updates if website structure changes
