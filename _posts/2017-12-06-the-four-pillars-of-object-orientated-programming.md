---
layout: post
title: The Four Pillars of Object-Orientated Programming
permalink: the-four-pillars-of-object-orientated-programming
date: 2017-12-06 00:24:00
---

### Summary

For a programming language to be properly considered "Object Orientated", it must fit four main concepts. These concepts are known as the four pillars of OOP: inheritance, polymorphism, abstraction, and encapsulation.

**Note:** for a programming language to be considered OOP it must be able to create classes that can interact with one another.

OOP Languages:
- Java
- Python
- Ruby

Functional Languages:
- PHP
- Haskell
- Lisp

### Inheritance

When you create a class, you can *inherit* another class, which allows the child class to access the parent's variables and methods.

```python
class MotherDuck():
    def __init__(self, name, weight, is_hungry):
        self.name = name
        self.weight = weight
        self.is_hungry = is_hungry

class Duckling(MotherDuck):
    def cry(self):
        print("{name} starts to cry".format(name=self.name))
```

Now that we have defined both our parent class (MotherDuck) and our child class (Duckling), we can observe how they interact with each other. Notice that when defining the `Duckling` class we pass it the argument `MotherDuck`, which in turn tells the compiler that we want to inherit all of `MotherDuck` class variables and methods. Unless the child class defines the constructor the child class will also inherit it.

First, create a new duckling and call its cry method

```python
>>> duckling = Duckling("Jake", 2, False)
>>> duckling.cry()
Jake starts to cry
```

Now try to do the same with parent class (MotherDuck)

```python
>>> mama = MotherDuck("Karen", 5, True)
>>> mama.is_hungry
True
>>> mama.cry()
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
AttributeError: MotherDuck instance has no attribute 'cry'
```

Only the child class will be able to use the parent class's variables and methods, this makes for cleaner code and less redundancy.

### Polymorphism

A great definition of pragmatic polymorphism is, "polymorphism is the ability (in programming) to present the same interface for different underlying forms (data types)." An interface refers to one or more functions or methods. Meaning a function or method that can achieve a similar result with different data types (eg. string, int, float, bool, etc.)

If we look at python's built-in function `print()` we know that it will take any different data type (including classes) and determine  what to appropriately print to the console depending on the variable type. This is done without the user needing to call a seperate function for a specific data type. eg. `print_bool()` `print_string()`

### Abstraction

Abstraction is used in OOP when we create a class and define its methods. When we define a class and its methods, we are
creating an *abstraction*. We are creating *abstractions* of different concepts that all work together to form our program. Abstraction allows us to model objects with clear boundaries, and have them interact with each other.

### Encapsulation

Encapsulation hides our codes internal data. When code and data have been encapsulated, it means when it is called, the caller cannot access the code's internal data. This concept plays a big role in security by denying access to certain pieces of data.

This also helps when trying to maintain code that is reliable, such as changing a data type from a list to a tuple. Trying to directly append to a tuple will give issues if we are expecting to append to a list. We can solve this issue by making a function that appends to our desired data type with a single function. This keeps the list/tuple data secret while still giving reliable functionality to a program or any clients that use the code.

### Composition

This is not one of the four pillars of OOP but it is an important concept that helps the rest. The composition of a program represents "has a" relationships, this occurs when one object stores a reference to another object as a variable.

For example, I will show the relationship between a dog and it's owner.

```python
class Dog():
    def __init__(self, name, breed, owner):
        self.name = name
        self.breed = breed
        self.owner = owner

class Person():
    def __init__(self, name):
        self.name = name
```

When we create a new dog object, we pass in our person object as the owner

```python
>>> rob = Person("Dread Pirate Roberts")
>>> dog = Dog("Kevin", "Chihuahua", rob)
>>> print(dog.owner.name)
Dread Pirate Roberts
```

Now the dog _Kevin_ belongs to _Dread Pirate Roberts_, and we can easily reference the dog's owner.
