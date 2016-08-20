from flask import Flask
import os
app = Flask(__name__)


@app.route("/")
def hello():
    return "Hello, World!"

if __name__ == "__main__":
    for root, dirs, files in os.walk('/tmp'):
        print(dirs, files)


    app.run()
