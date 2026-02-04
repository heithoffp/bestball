#!/usr/bin/env python3
"""
Scraper for DraftSharks Underdog ADP data
Uses Microsoft Edge browser
"""

import csv
import time
import sys
from datetime import datetime

def scrape_with_selenium(url):
    """
    Scrape using Selenium with Edge browser
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.edge.options import Options
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from bs4 import BeautifulSoup
        
        print("Starting Edge browser...")
        
        # Setup Edge options
        edge_options = Options()
        edge_options.add_argument('--headless')  # Run in background
        edge_options.add_argument('--no-sandbox')
        edge_options.add_argument('--disable-dev-shm-usage')
        edge_options.add_argument('--disable-gpu')
        edge_options.add_argument('--window-size=1920,1080')
        edge_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')
        
        # Initialize Edge driver
        driver = webdriver.Edge(options=edge_options)
        driver.get(url)
        
        print("Waiting for table to load...")
        
        # Wait for the table container to be present
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.ID, "adp-table-container")))
        
        # Wait for actual data to load (player names)
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "player-name")))
        
        # Give extra time for all data to populate
        time.sleep(3)
        
        print("Parsing data...")
        
        # Get page source and parse
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        driver.quit()
        
        return parse_draftsharks_html(soup)
        
    except ImportError:
        print("\n❌ ERROR: Selenium is not installed!")
        print("\nThis website requires Selenium to load the data.")
        print("Install it with: pip install selenium")
        return None, []
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure you have:")
        print("1. Microsoft Edge browser installed")
        print("2. Selenium installed: pip install selenium")
        print("\nNote: Selenium should automatically manage the Edge driver.")
        return None, []

def parse_draftsharks_html(soup):
    """
    Parse the DraftSharks HTML structure
    """
    players_data = []
    
    # Find the table container
    table_container = soup.find('div', id='adp-table-container')
    
    if not table_container:
        print("Could not find table container")
        return None, []
    
    # Find all table rows with player data
    rows = table_container.find_all('tr')
    
    print(f"Found {len(rows)} rows in table")
    
    # Extract headers
    headers = ['Rank', 'Player Name', 'Position', 'Team', 'ADP']
    
    for idx, row in enumerate(rows, 1):
        # Skip header rows or empty rows
        if not row.find('td', class_='player-name'):
            continue
        
        try:
            # Extract player name cell
            player_cell = row.find('td', class_='player-name')
            
            if player_cell:
                name_span = player_cell.find('span', class_='name')
                position_span = player_cell.find('span', class_='position')
                team_span = player_cell.find('span', class_='team')
                
                player_name = name_span.get_text(strip=True) if name_span else ''
                position = position_span.get_text(strip=True) if position_span else ''
                team = team_span.get_text(strip=True) if team_span else ''
            else:
                continue
            
            # Extract ADP value
            adp_cell = row.find('td', class_='average-draft-position')
            adp_value = ''
            if adp_cell:
                adp_span = adp_cell.find('span', class_='adp-value')
                adp_value = adp_span.get_text(strip=True) if adp_span else ''
            
            # Get rank (row number)
            rank = str(idx)
            
            # Only add if we have at least a player name
            if player_name:
                players_data.append([rank, player_name, position, team, adp_value])
        
        except Exception as e:
            print(f"Error parsing row {idx}: {e}")
            continue
    
    return headers, players_data

def save_to_csv(headers, data, filename=None):
    """
    Save the scraped data to a CSV file with date in filename
    """
    # Generate filename with current date if not provided
    if filename is None:
        current_date = datetime.now().strftime('%Y-%m-%d')
        filename = f'underdog_adp_{current_date}.csv'
    
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(headers)
            writer.writerows(data)
        
        print(f"\n✅ Data successfully saved to {filename}")
        print(f"✅ Total players: {len(data)}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving to CSV: {e}")
        return False

def display_preview(headers, data, num_rows=10):
    """
    Display a preview of the scraped data
    """
    print("\n" + "="*100)
    print(f"PREVIEW - First {min(num_rows, len(data))} players:")
    print("="*100)
    print(" | ".join(headers))
    print("-"*100)
    
    for player in data[:num_rows]:
        print(" | ".join(player))
    
    if len(data) > num_rows:
        print(f"\n... and {len(data) - num_rows} more players")
    print("="*100)

def main():
    url = "https://www.draftsharks.com/adp/underdog"
    
    print("="*100)
    print("DRAFTSHARKS UNDERDOG ADP SCRAPER (Microsoft Edge)")
    print("="*100)
    print(f"Target URL: {url}\n")
    
    # Scrape the data using Selenium with Edge
    headers, players_data = scrape_with_selenium(url)
    
    # Save and display results
    if players_data and len(players_data) > 0:
        display_preview(headers, players_data)
        save_to_csv(headers, players_data)
        print("\n✅ Scraping completed successfully!")
    else:
        print("\n❌ No data was scraped.")
        print("\nTroubleshooting steps:")
        print("1. Make sure Microsoft Edge browser is installed")
        print("2. Install Selenium: pip install selenium")
        print("3. Check if the website is accessible in your browser")
        print("4. The website structure may have changed")

if __name__ == "__main__":
    main()