import fitz
import sys

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page_num in range(min(15, len(doc))): # Read first 15 pages initially
        page = doc.load_page(page_num)
        text += f"--- Page {page_num + 1} ---\n{page.get_text()}\n\n"
    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    try:
        text = extract_text(pdf_path)
        with open("pdf_content.txt", "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Successfully extracted {len(text)} characters.")
    except Exception as e:
        print(f"Error: {e}")
