# Remote-Music-Player

Stream your own music from your own server right through your browser.

##Desktop Browser
![Remote Music Player](/screenshots/desktop1.png?raw=true "Remote Music Player")
![Remote Music Player](/screenshots/desktop2.png?raw=true "Remote Music Player")

##Mobile Browser
![Remote Music Player](/screenshots/mobile1.png?raw=true "Remote Music Player")
![Remote Music Player](/screenshots/mobile2.png?raw=true "Remote Music Player")

## Requirements
- python3 (3.4 and 3.5 tested)
- ffmpeg (for getting audio metadata on server)
- mplayer (for server speaker playback)

## Installation
Simply run:

`pip3 install -r requirements.txt`

to install python dependencies.

## Docker
Build the docker image in the Remote-Media-Player directory:

`docker build -t rmp .`

This process will take a while as it needs to compile ffmpeg.

Then to run the server

`docker run -v <YOUR MUSIC FOLDER PATH>:/server/music -p <YOUR PORT NUMBER>:25222 rmp`


## Running the Server
To start the server:

`rmp.py [-p <PORT NUMBER>] <MusicDirectory>`

Music directory must be located within the directory that the server is started in. This can be done with a symlink.

## Accessing the Player

To get to the player, visit this address in any browser:

`127.0.0.1:<PORT NUMBER>/gui?stream=true`

