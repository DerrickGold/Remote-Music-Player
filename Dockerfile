FROM ubuntu:latest

#install dependencies
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip autoconf automake build-essential \
	libass-dev libfreetype6-dev libtheora-dev libtool libvorbis-dev libopus-dev libx264-dev libmp3lame-dev pkg-config \
	texinfo zlib1g-dev yasm wget && \
	rm -rf /var/lib/apt/lists/*


RUN mkdir ~/ffmpeg_sources

#get libfdk-aac
RUN cd ~/ffmpeg_sources && \
	wget -O fdk-aac.tar.gz https://github.com/mstorsjo/fdk-aac/tarball/master && \
	tar xzvf fdk-aac.tar.gz && \
	cd mstorsjo-fdk-aac* && \
	autoreconf -fiv && \
	./configure --prefix="$HOME/ffmpeg_build" --disable-shared && \
	make && \
	make install && \
	make distclean


#build ffmpeg
RUN cd ~/ffmpeg_sources && \
	wget http://ffmpeg.org/releases/ffmpeg-snapshot.tar.bz2 && \
	tar xjvf ffmpeg-snapshot.tar.bz2 && \
	cd ffmpeg && \
	PATH="$HOME/bin:$PATH" PKG_CONFIG_PATH="$HOME/ffmpeg_build/lib/pkgconfig" ./configure \
	  --prefix="$HOME/ffmpeg_build" \
  	--pkg-config-flags="--static" \
  	--extra-cflags="-I$HOME/ffmpeg_build/include" \
  	--extra-ldflags="-L$HOME/ffmpeg_build/lib" \
  	--bindir="$HOME/bin" \
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
	PATH="$HOME/bin:$PATH" make && \
	make install && \
	make distclean && \
	hash -r


#add server files
RUN mkdir /server && cd /server && mkdir .cache
ADD ./static /server/static
ADD ./templates /server/templates
ADD ./rmp.py /server/rmp.py
ADD ./requirements.txt /server/reqs.txt

#install server dependencies
RUN cd /server && pip3 install -r reqs.txt

EXPOSE 25222
VOLUME /server/music
WORKDIR /server
ENV PATH "$PATH:/root/bin"
CMD [ "/usr/bin/python3", "rmp.py", "-p", "25222", "music" ]
