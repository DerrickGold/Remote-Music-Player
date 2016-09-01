# Remote-Music-Player

Stream your own music from your own server right through your browser.

##Desktop Browser
![Remote Music Player](/screenshots/desktop1.png?raw=true "Remote Music Player")
![Remote Music Player](/screenshots/desktop2.png?raw=true "Remote Music Player")

##Mobile Browser
![Remote Music Player](/screenshots/mobile1.png?raw=true "Remote Music Player")
![Remote Music Player](/screenshots/mobile2.png?raw=true "Remote Music Player")

## Requirements:
- python3 (3.4 and 3.5 tested)
- ffmpeg (for getting audio metadata on server)
- mplayer (for server speaker playback)

## Installation:
Simply run:

`pip3 install -r requirements.txt`

to install python dependencies.

## Running the Server:
To start the server:

`rmp.py [-p <PORT NUMBER>] <MusicDirectory>`

Music directory must be located within the directory that the server is started in. This can be done with a symlink.

## Accessing the Player:

To get to the player, visit this address in any browser:

`127.0.0.1:<PORT NUMBER>/gui?stream=true`

