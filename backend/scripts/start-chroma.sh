#!/bin/bash
# Script to set up python virtual environment and run ChromaDB server locally

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BACKEND_DIR="$( dirname "$SCRIPT_DIR" )"
VENV_DIR="$BACKEND_DIR/venv"
DB_DIR="$BACKEND_DIR/db/chroma_data"

# Make sure Chroma database directory exists
mkdir -p "$DB_DIR"

echo "=== ChromaDB Setup & Start Script ==="

# Check if python3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed or not in PATH."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create virtual environment."
        exit 1
    fi
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Check if chromadb is installed in venv, if not install it
if ! python3 -c "import chromadb" &> /dev/null; then
    echo "chromadb is not installed. Installing via pip..."
    pip install --upgrade pip
    pip install chromadb
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install chromadb."
        exit 1
    fi
    echo "chromadb installed successfully."
fi

# Run ChromaDB
echo "Starting ChromaDB server on port 8000..."
echo "Database path: $DB_DIR"
exec chroma run --host 127.0.0.1 --port 8000 --path "$DB_DIR"
