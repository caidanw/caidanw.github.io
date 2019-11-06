---
layout: post
title: Programming Paradigms
permalink: programming-paradigms
date: 2017-12-04 20:35:00
---

### Summary

There are a lot of different programming paradigms, though it is non-essential to learn all of them right away. The basic paradigms are imperative programming, functional programming, and object-orientated programming. There is also the state of a program, which is the where and what of the variables of a program are at a given time when the program is being run. Different paradigms have different effects on a program's state. They also manipulate the way a program's state changes and how it changes those states.

### Imperative Programming

This paradigm is fairly easy to understand, though this should probably never be used professionally unless it's a simple one-off script. To sum up how this is implemented, "do this, then that". Imperative programs consist of a sequence of steps that ultimately get closer to a single solution. Each step is changing the program's state. There are no functions or classes that are being created and used, only variables are being created and altered (we only change a program's state when we modify, remove, introduce new variables to the program).

```python
>>> x = 1
>>> y = 5
>>> z = 9
>>> xyz = x + y + z
>>> print(xyz) 
15
```

### Functional Programming

As the name suggests, functional programming only uses functions within the program (variables as well, no classes). More specifically, it involves functions that when given the same input will always return the same output. As Mary Rose Cook once said, _"Functional code is characterized by one thing: the absence of side effects. It doesn't rely on data outside the current function, and it doesn't change data that exists outside the current function."_

This is an _unfunctional_ function:

```python
a = 0

def increment():
    global a
    a += 1
```

Here is a _functional_ function:

```python
a = 0

def increment(a):
    return a + 1

a = increment(a)
```

Notice that the unfunctional function pulls the variable `a` from outside of the functions local scope, thus leading to unpredictable results and changing the state of the program. Whereas the functional function uses any variable that is passed through its argument, leaving out any room for unexpected results and not changing the state of the program.
Both examples increment `a` by 1.

### Object-Orientated Programming

This paradigm involves writing programs where you define and create objects that interact with each other. Strings, integers, and floats are all examples of objects. You can also define your own objects by using classes. Think of a class as a blueprint used to create objects. Methods are like functions, except they are defined in a class and belong to that class. We can only call a class' method if we first create an object from the desired class.

We create a class by using the *class* keyword:  
```python
>>> class Orange:
...     print("Orange created")
... 
Orange created
```

After we declare the class, it will run anything not inside a method.

If we create an object based off the *Orange* class then we can query it to verify that it's an instance of our object.
```python
>>> orange = Orange()
>>> print(type(orange))
<type 'instance'>
>>> print(orange)
<__main__.Orange instance at 0x7fbb2a9ecc68>
```