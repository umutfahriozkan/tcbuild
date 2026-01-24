all: build/app 
OBJ_app= build/app.c.o build/lib.c.o
build/app:$(OBJ_app)
	  
build/app.c.o: app.c
	@mkdir -p $(dir $@)
	    -c -MMD -MF $@.d -o $@ $< -g0 -O2   -aaaa
build/lib.c.o: lib.c
	@mkdir -p $(dir $@)
	     -c -MMD -MF $@.d -o $@ $< -g0 -O2   -aaaa
-include $(OBJ_app:=.d)

