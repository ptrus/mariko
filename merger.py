import sys
import glob
import re
import csv
from pathlib import Path

def extract_year(filename, prefix):
    # Match something like xxx_2023.csv and extract 2023
    match = re.match(rf'{re.escape(prefix)}.*?_(\d{{4}})\.csv$', filename)
    return int(match.group(1)) if match else float('inf')

def main():
    if len(sys.argv) != 2:
        print("Usage: python merge_csv.py <prefix>")
        sys.exit(1)

    prefix = sys.argv[1]
    files = glob.glob(f"{prefix}_20*.csv")
    
    if not files:
        print(f"No matching files found for prefix: {prefix}")
        sys.exit(1)

    # Sort files by year extracted from filename
    files.sort(key=lambda f: extract_year(Path(f).name, prefix))

    output_file = f"{prefix}.csv"
    with open(output_file, "w", newline="") as outfile:
        writer = None

        for i, file in enumerate(files):
            print(f"Processing {file}")
            with open(file, newline="") as infile:
                reader = csv.reader(infile)
                header = next(reader)

                if writer is None:
                    writer = csv.writer(outfile)
                    writer.writerow(header)  # Write header once

                for row in reader:
                    writer.writerow(row)

    print(f"Merged into {output_file}")

if __name__ == "__main__":
    main()

