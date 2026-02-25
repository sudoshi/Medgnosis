#!/usr/bin/env python3
import os

# A simple list of patterns that imply "client-only" usage
# You can expand this list as needed
EVENT_HANDLER_PATTERNS = [
    "onClick", "onSubmit", "onChange", "onFocus", "onBlur",
    "onKeyDown", "onKeyUp", "onKeyPress", "onMouseOver", "onMouseLeave"
]
REACT_HOOKS = [
    "useState", "useEffect", "useRef", "useReducer", "useCallback", "useMemo"
]

IGNORE_DIRS = {
    "node_modules",
    ".next",
    ".git",
    # add other directories to ignore if needed
}

# Extensions to scan for React components
SCAN_EXTENSIONS = (".js", ".jsx", ".ts", ".tsx")

def file_contains_any(content, substrings):
    return any(substring in content for substring in substrings)

def add_use_client_if_needed(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Already has "use client" on the first line? We skip it
    if lines and ('"use client"' in lines[0] or "'use client'" in lines[0]):
        return False  # No change

    content = "".join(lines)

    # Check if it has event handlers or React hooks
    if file_contains_any(content, EVENT_HANDLER_PATTERNS + REACT_HOOKS):
        # Insert "use client" at the top
        new_content = f'"use client"\n{content}'
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True

    return False

def main():
    root_dir = os.getcwd()
    print(f"Scanning directory: {root_dir}\n")

    changed_files = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Remove directories we want to ignore from the search
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]

        for filename in filenames:
            if filename.endswith(SCAN_EXTENSIONS):
                full_path = os.path.join(dirpath, filename)
                # Attempt to add "use client" if we detect client-side usage
                changed = add_use_client_if_needed(full_path)
                if changed:
                    changed_files.append(full_path)
                    print(f"Added 'use client' -> {full_path}")

    if not changed_files:
        print("No files updated. Either none needed 'use client' or script found nothing.")
    else:
        print("\nDone. Manually review updated files to ensure correctness.")

if __name__ == "__main__":
    main()
