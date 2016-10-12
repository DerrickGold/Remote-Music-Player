FROM ubuntu:latest

#install dependencies
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip autoconf automake build-essential \
	libass-dev libfreetype6-dev libtheora-dev libtool libvorbis-dev libopus-dev libx264-dev libmp3lame-dev pkg-config \
	texinfo zlib1g-dev yasm wget && \
	rm -rf /var/lib/apt/lists/*


RUN mkdir ~/ffmpeg_sources

#get libfdk-aac
RUN cd /root/ffmpeg_sources && \
	wget -O fdk-aac.tar.gz https://github.com/mstorsjo/fdk-aac/tarball/master && \
	tar xzvf fdk-aac.tar.gz && \
	libtoolize && \
	cd mstorsjo-fdk-aac* && \
	autoreconf -fiv && \
	./configure --prefix="/root/ffmpeg_build" --disable-shared && \
	make && \
	make install && \
	make distclean


#build ffmpeg
RUN cd /root/ffmpeg_sources && \
	wget http://ffmpeg.org/releases/ffmpeg-snapshot.tar.bz2 && \
	tar xjvf ffmpeg-snapshot.tar.bz2 && \
	cd ffmpeg && \
	PATH="/root/bin:$PATH" PKG_CONFIG_PATH="/root/ffmpeg_build/lib/pkgconfig" ./configure \
	  --prefix="/root/ffmpeg_build" \
  	--pkg-config-flags="--static" \
  	--extra-cflags="-I/root/ffmpeg_build/include" \
  	--extra-ldflags="-L/root/ffmpeg_build/lib" \
  	--bindir="/root/bin" \
  	--enable-gpl \
  	--enable-libass \
  	--enable-libfdk-aac \
  	--enable-libfreetype \
  	--enable-libmp3lame \
  	--enable-libopus \
  	--enable-libtheora \
  	--enable-libvorbis \
  	--enable-libx264 \
  	--enable-nonfree &&\
	PATH="/root/bin:$PATH" make && \
	make install && \
	make distclean && \
	hash -r


#add server files
RUN mkdir /server && mkdir /server/.cache && chmod -R 755 /server
WORKDIR /server

ADD ./static static
ADD ./templates templates
ADD ./rmp.py rmp.py
ADD ./requirements.txt reqs.txt

#install server dependencies
RUN pip3 install -r reqs.txt

EXPOSE 25222
VOLUME /server/music
ENV PATH "$PATH:/root/bin"
CMD [ "/usr/bin/python3", "rmp.py", "-p", "25222", "music" ]
