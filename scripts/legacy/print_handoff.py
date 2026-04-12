
import json

handoff_data = {
    "version": "3.0.0",
    "host": "127.0.0.1",
    "version_file": "C:\Users\arman\Downloads\Test workflows - Copia\package.json",
    "host_file": "C:\Users\arman\Downloads\Test workflows - Copia\README.md"
}

# Construct the handoff string
handoff_string = f"__HANDOFF__:route-reader:{json.dumps(handoff_data)}"

# Print the handoff string
print(handoff_string)
