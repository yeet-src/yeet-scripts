IMAGE ?= yeet-try

# Pick your poison
HOSTNAMES := darling hilshire goat pirate the-bear noodle dopey ace \
             penguin blacky mopey quick-save snake donut weasel tooth \
             wilshire shadow ghost saucy prancer grumpy sleepy hambone
RANDOM_HOST = $(shell echo "$(HOSTNAMES)" | tr ' ' '\n' | grep -v '^$$' | \
              awk 'BEGIN{srand()} {a[NR]=$$0} END{print a[int(rand()*NR)+1]}')

.PHONY: all build run banger

all: build run

banger:
	@./opt/scripts/banger/manage.sh

build:
	docker build --build-arg YEET_CACHEBUST=$$(date +%s) -t $(IMAGE) . > /dev/null

run:
	docker run --rm -it --hostname $(RANDOM_HOST) \
	    --label "yeet.hostname=$(RANDOM_HOST)" \
	    -e TERM=xterm-256color \
	    -e COLORTERM=truecolor \
	    -e FORCE_COLOR=1 \
	    -e CLICOLOR=1 \
	    -e CLICOLOR_FORCE=1 \
	    $(IMAGE)

