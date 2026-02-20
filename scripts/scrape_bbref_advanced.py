#!/usr/bin/env python3
"""
Fetch NBA 2024-25 Advanced Stats from Basketball Reference
and output as a Python file with ADVANCED_STATS list of dicts.
"""

import requests
from bs4 import BeautifulSoup, Comment
import time
import re
import unicodedata

# Non-ASCII character fix map (same as per-game data approach)
NAME_FIXES = {
    'Nikola Jokić': 'Nikola Jokic',
    'Luka Dončić': 'Luka Doncic',
    'Kristaps Porziņģis': 'Kristaps Porzingis',
    'Nikola Vučević': 'Nikola Vucevic',
    'Goran Dragić': 'Goran Dragic',
    'Bogdan Bogdanović': 'Bogdan Bogdanovic',
    'Bojan Bogdanović': 'Bojan Bogdanovic',
    'Jonas Valančiūnas': 'Jonas Valanciunas',
    'Domantas Sabonis': 'Domantas Sabonis',
    'Davis Bertāns': 'Davis Bertans',
    'Jusuf Nurkić': 'Jusuf Nurkic',
    'Dario Šarić': 'Dario Saric',
    'Vasilije Micić': 'Vasilije Micic',
    'Aleksej Pokuševski': 'Aleksej Pokusevski',
    'Vlatko Čančar': 'Vlatko Cancar',
    'Sandro Mamukelashvili': 'Sandro Mamukelashvili',
    'Luka Garza': 'Luka Garza',
    'Nikola Đurišić': 'Nikola Djurisic',
    'Nikola Jović': 'Nikola Jovic',
    'Tristan Vukčević': 'Tristan Vukcevic',
    'Vít Krejčí': 'Vit Krejci',
    'Moussa Diabaté': 'Moussa Diabate',
    'Théo Maledon': 'Theo Maledon',
    'Tidjane Salaün': 'Tidjane Salaun',
    'Ömer Yurtseven': 'Omer Yurtseven',
    'Alperen Şengün': 'Alperen Sengun',
    'Cedi Osman': 'Cedi Osman',
    'Moritz Wagner': 'Moritz Wagner',
    'Dennis Schröder': 'Dennis Schroder',
    'Maxi Kleber': 'Maxi Kleber',
    'Daniel Theis': 'Daniel Theis',
    'Isaiah Hartenstein': 'Isaiah Hartenstein',
}


def fix_player_name(name):
    """Fix non-ASCII characters in player names."""
    # Remove any trailing asterisks or markers
    name = name.rstrip('*').strip()

    # Check explicit map first
    if name in NAME_FIXES:
        return NAME_FIXES[name]

    # General approach: transliterate accented characters
    # NFD decomposition splits base char + combining accent
    nfkd = unicodedata.normalize('NFKD', name)
    ascii_name = ''
    for ch in nfkd:
        if unicodedata.category(ch) == 'Mn':
            # Skip combining marks (accents)
            continue
        # Handle specific non-decomposable chars
        if ch == 'đ' or ch == 'Đ':
            ascii_name += 'Dj' if ch == 'Đ' else 'dj'
        elif ch == 'ß':
            ascii_name += 'ss'
        elif ch == 'ø' or ch == 'Ø':
            ascii_name += 'O' if ch == 'Ø' else 'o'
        elif ch == 'æ' or ch == 'Æ':
            ascii_name += 'Ae' if ch == 'Æ' else 'ae'
        elif ch == 'ğ':
            ascii_name += 'g'
        elif ch == 'Ğ':
            ascii_name += 'G'
        elif ch == 'ş' or ch == 'Ş':
            ascii_name += 'S' if ch == 'Ş' else 's'
        elif ch == 'ņ' or ch == 'Ņ':
            ascii_name += 'N' if ch == 'Ņ' else 'n'
        elif ch == 'ģ' or ch == 'Ģ':
            ascii_name += 'G' if ch == 'Ģ' else 'g'
        else:
            ascii_name += ch

    return ascii_name


def parse_float(val):
    """Parse a float value, return None if empty."""
    if val is None or val.strip() == '':
        return None
    try:
        return float(val)
    except ValueError:
        return None


def parse_int(val):
    """Parse an int value, return None if empty."""
    if val is None or val.strip() == '':
        return None
    try:
        return int(val)
    except ValueError:
        return None


def fetch_advanced_stats():
    url = 'https://www.basketball-reference.com/leagues/NBA_2025_advanced.html'

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }

    print(f"Fetching {url}...")
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    # Force UTF-8 encoding (Basketball Reference uses UTF-8 but reports ISO-8859-1)
    resp.encoding = 'utf-8'
    print(f"Got response: {resp.status_code}, length: {len(resp.text)}")

    soup = BeautifulSoup(resp.text, 'html.parser')

    # The table might be in a comment (Basketball Reference does this)
    table = soup.find('table', id='advanced_stats') or soup.find('table', id='advanced')

    if not table:
        # Check inside HTML comments
        comments = soup.find_all(string=lambda text: isinstance(text, Comment))
        for comment in comments:
            if 'advanced' in str(comment).lower() and '<table' in str(comment):
                comment_soup = BeautifulSoup(str(comment), 'html.parser')
                table = comment_soup.find('table', id='advanced_stats') or comment_soup.find('table', id='advanced')
                if table:
                    print("Found table inside HTML comment")
                    break

    if not table:
        # Try finding any table with advanced stats headers
        all_tables = soup.find_all('table')
        print(f"Found {len(all_tables)} tables total")
        for t in all_tables:
            thead = t.find('thead')
            if thead and 'PER' in thead.get_text():
                table = t
                print(f"Found table by header content, id={t.get('id', 'no-id')}")
                break

    if not table:
        print("ERROR: Could not find the advanced stats table!")
        print("Page title:", soup.title.string if soup.title else "No title")
        # Debug: print first 2000 chars
        print(resp.text[:2000])
        return []

    # Parse header
    thead = table.find('thead')
    header_rows = thead.find_all('tr')
    # Use the last header row (the one with actual column names)
    header_row = header_rows[-1]
    headers = []
    for th in header_row.find_all('th'):
        col_name = th.get('data-stat', th.get_text(strip=True))
        headers.append(col_name)

    print(f"Headers: {headers}")

    # Parse body
    tbody = table.find('tbody')
    rows = tbody.find_all('tr')

    players = []
    seen_players = {}  # Track traded players: name -> first occurrence index

    for row in rows:
        # Skip separator rows
        if row.get('class') and 'thead' in row.get('class', []):
            continue

        cells = row.find_all(['th', 'td'])
        if len(cells) < 10:
            continue

        # Build a dict mapping data-stat to value
        row_data = {}
        for cell in cells:
            stat = cell.get('data-stat', '')
            row_data[stat] = cell.get_text(strip=True)

        player_name = row_data.get('name_display', '')
        if not player_name or player_name == 'League Average':
            continue

        # Fix name
        player_name = fix_player_name(player_name)

        team = row_data.get('team_name_abbr', '')

        # For traded players: keep only the TOT row
        # If team is "TOT", this is the total row - keep it
        # If team is "2TM" or "3TM", this is also a total indicator
        # Individual team rows for traded players come after TOT

        if team in ('2TM', '3TM', '4TM', 'TOT'):
            # This is the season total row for a traded player
            # Mark that we've seen this player's total
            seen_players[player_name] = True
            team_val = 'TOT'
        elif player_name in seen_players:
            # Skip individual team rows for traded players
            continue
        else:
            team_val = team

        # Extract stats
        entry = {
            'Player': player_name,
            'Age': parse_int(row_data.get('age', '')),
            'Tm': team_val,
            'Pos': row_data.get('pos', ''),
            'G': parse_int(row_data.get('games', '')),
            'MP': parse_int(row_data.get('mp', '')),
            'PER': parse_float(row_data.get('per', '')),
            'TS_PCT': parse_float(row_data.get('ts_pct', '')),
            'TPAr': parse_float(row_data.get('fg3a_per_fga_pct', '')),
            'FTr': parse_float(row_data.get('fta_per_fga_pct', '')),
            'ORB_PCT': parse_float(row_data.get('orb_pct', '')),
            'DRB_PCT': parse_float(row_data.get('drb_pct', '')),
            'TRB_PCT': parse_float(row_data.get('trb_pct', '')),
            'AST_PCT': parse_float(row_data.get('ast_pct', '')),
            'STL_PCT': parse_float(row_data.get('stl_pct', '')),
            'BLK_PCT': parse_float(row_data.get('blk_pct', '')),
            'TOV_PCT': parse_float(row_data.get('tov_pct', '')),
            'USG_PCT': parse_float(row_data.get('usg_pct', '')),
            'OWS': parse_float(row_data.get('ows', '')),
            'DWS': parse_float(row_data.get('dws', '')),
            'WS': parse_float(row_data.get('ws', '')),
            'WS_48': parse_float(row_data.get('ws_per_48', '')),
            'OBPM': parse_float(row_data.get('obpm', '')),
            'DBPM': parse_float(row_data.get('dbpm', '')),
            'BPM': parse_float(row_data.get('bpm', '')),
            'VORP': parse_float(row_data.get('vorp', '')),
        }

        players.append(entry)

    print(f"Parsed {len(players)} players")
    return players


def write_output(players, output_path):
    """Write the data as a Python file."""
    with open(output_path, 'w') as f:
        f.write("ADVANCED_STATS = [\n")
        for i, p in enumerate(players):
            parts = []
            parts.append(f"'Player': {repr(p['Player'])}")
            parts.append(f"'Age': {p['Age']}")
            parts.append(f"'Tm': {repr(p['Tm'])}")
            parts.append(f"'Pos': {repr(p['Pos'])}")
            parts.append(f"'G': {p['G']}")
            parts.append(f"'MP': {p['MP']}")
            parts.append(f"'PER': {p['PER']}")
            parts.append(f"'TS_PCT': {p['TS_PCT']}")
            parts.append(f"'TPAr': {p['TPAr']}")
            parts.append(f"'FTr': {p['FTr']}")
            parts.append(f"'ORB_PCT': {p['ORB_PCT']}")
            parts.append(f"'DRB_PCT': {p['DRB_PCT']}")
            parts.append(f"'TRB_PCT': {p['TRB_PCT']}")
            parts.append(f"'AST_PCT': {p['AST_PCT']}")
            parts.append(f"'STL_PCT': {p['STL_PCT']}")
            parts.append(f"'BLK_PCT': {p['BLK_PCT']}")
            parts.append(f"'TOV_PCT': {p['TOV_PCT']}")
            parts.append(f"'USG_PCT': {p['USG_PCT']}")
            parts.append(f"'OWS': {p['OWS']}")
            parts.append(f"'DWS': {p['DWS']}")
            parts.append(f"'WS': {p['WS']}")
            parts.append(f"'WS_48': {p['WS_48']}")
            parts.append(f"'OBPM': {p['OBPM']}")
            parts.append(f"'DBPM': {p['DBPM']}")
            parts.append(f"'BPM': {p['BPM']}")
            parts.append(f"'VORP': {p['VORP']}")

            line = "    {" + ", ".join(parts) + "}"
            if i < len(players) - 1:
                line += ","
            f.write(line + "\n")
        f.write("]\n")

    print(f"Wrote {len(players)} players to {output_path}")


if __name__ == '__main__':
    players = fetch_advanced_stats()
    if players:
        output_path = '/Users/miladzolnoor/CourtIQ/nba_top150_advanced_2025.py'
        write_output(players, output_path)

        # Print some sample entries
        print("\nFirst 3 entries:")
        for p in players[:3]:
            print(f"  {p['Player']} ({p['Tm']}): PER={p['PER']}, WS={p['WS']}, BPM={p['BPM']}")

        print(f"\nTotal unique players: {len(players)}")
    else:
        print("No players found!")
