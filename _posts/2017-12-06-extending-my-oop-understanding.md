---
layout: post
title: Extending My OOP Understanding
permalink: extending-my-oop-understanding
date: 2017-12-06 21:23:00
---

### Summary

There is always more to learn, especially if that focus is on
programming. The focus of this section will be on Python specific OOP.
This includes understanding how variables work, the "is" syntax, "None"
syntax, "Super" syntax, classes are objects, class vs. instance
variables, private variables, overriding methods, and overriding
built-in methods.

“Commenting your code is like cleaning your bathroom - you never want to
do it, but it really does create a more pleasant experience for you and
your guests.”  
—Ryan Campbel

---

### The Underlying Mechanics of Variables

Every variable "points" to an object. For example, we can create a new
variable  `j`  which we will give an arbitrary value.

`>>> j = 20`

The variable  `j`  we created will now point to an integer object that
holds the value of  `20` .

If we now assign the variable  `j`  to have a new value, we are telling
the compiler we want to create a new integer object with our new desired
value.

`>>> j = 15`

Now that our variable  `j`  points to a new integer object with the
value  `15` . What happens to the old integer object with the value of 
`20` ? The old object is not being used, so it gets discarded. This, in
essence, is Python's garbage collection.

To elaborate we can have two different variables point to the same
object (int, str, etc.)

`>>> j = 20 >>> k = j >>> print(j) 20 >>> print(k) 20`

Keep in mind that objects are not tied to the variable that originally
created them. So if we delete  `j`  after we have assigned  `k`  the
same integer object, we will still have the same object as it is still
be used by part of the program. Both  `j`  and  `k`  point to the same
integer object that holds the value of  `20` .

---

### "Is"

The keyword "is" compares two objects based on their location in memory.
We will create a new class, and then initialize three new instance
objects from the class.

`class Puppy:   def __init__(self):     self.name = "Alexander II"`

`>>> pup = Puppy() >>> same_pup = pup >>> print(pup is same_pup) True
>>> another_pup = Puppy() >>> print(pup is another_pup) False`

Though  `pup`  and  `another_pup`  are from the class they aren't stored
in the same place in memory. We can see that  `pup`  and  `same_pup` 
return True because they both point to the same  `Puppy`  object in
memory.

` >>> print(pup)`

\>\>\> print(same\_pup)

\>\>\> print(another\_pup)

Here we can see the different locations in memory for the different
objects. We have only initialized two  `Puppy`  objects but we have
three variables. Two variables that point to  `0x03890B90`  and one
pointing to  `0x060A7090`.

---

### "None"

This is a built-in constant, it is used to represent the absence of a
value.

`>>> x = None >>> print(x) None`

This can be useful when you need to have a variable, but don't have a
value for it yet. You can have your program logic deal with the variable
properly.

---

### "Super"

This built-in function, lets us call a method a class has inherited from
its parent. The basic syntax structure to use the "Super" keyword is
below.

`super().[parent_method]([parameters])`

Replace the  `parent_method`  with the desired method you wish to call,
that can be found in the parent class. The  `parameters`  is what the
parent method takes as arguments.

---

### Are Classes Objects?

In Python, classes are objects. When you run a program that defines a
class, Python will turn that class into an object, which can be used in
your program.

`class Peanut:   pass`

` >>> print(Peanut)`

---

### Class vs. Instance Variables

A class can have two types of variables, class and instance. First, we
will look at instance variables. Instance variables belong to the object
that created them. They are created with the  `self`  keyword.

`class Chicken:   def __init__(self, name):     self.name = name`

`>>> phil = Chicken("Phillip") >>> print(phil.name) Phillip`

Instance variables are unique to each object created from a class. Class
variables are not unique, and every object of a certain class can use
that same class's variables.

`class Chicken:   species = "Bird"   def __init__(self, name):
    self.name = name`

`>>> chick = Chicken("Tim") >>> chick2 = Chicken("Jimbo")`

`>>> print(chick.name) Tim >>> print(chick2.name) Jimbo`

`>>> print(chick.species) Bird >>> print(chick2.species) Bird`

Class variables are useful when you want every object of a class to have
access to a variable.

---

### Private Variables

A lot of languages have at least some concept of private variables and
methods. Python is a little different, unlike other languages, Python
does not have syntax specifically for making variables private.
Therefore every variable in Python is public. Though there is a way to
indicate that a variable would like to be kept private, by using a
naming convention. If you have a variable or method the caller should
not access, you should precede its name with an underscore. Python
programmers know if a method or variable has a preceding underscore,
they should not use it, although keep in mind they will still be able to
use it at their own risk.

`class PublicPrivateExample:   def __init__(self):
    self.public_variable = "callers know they can access this"
    self._dontusethisvariable = "callers know they shouldn't access
this"   def public_method(self):     # callers know they can use this
method     pass   def _dont_use_this_method(self):     # callers know
they shouldn't use this method     pass`

---

### Overriding Methods

When you create a class that inherits a method from a parent, we can
then override the method to have child specific functionality. To
override a parent method, redefine the method with the same arguments,
then add your custom code to the body of the method.

`class Animal:   def __init__(self):     self.hunger = 100``   def
eat(self, amount):     self.hunger += amount     print("Animal has
eaten")`

`class Bird(Animal):   def eat(self, amount):     self.hunger += amount
    print("Bird has eaten")`

You do not need to use the same arguments when overriding a method but
if you don't then calling the child class's method without the correct
arguments, it may end up making a call to the parent's method.

---

### Overriding Built-In Methods

Every class in Python automatically inherits from a parent class called
Object. All classes in Python inherit methods from this parent class.
Python's built-in functions use these methods (often called magic
methods) for different situations, such as printing an object.

We can manipulate how we print an object from a certain class by
modifying the classes magic method  `__repr__`

`class Tree:   def __init__(self, age):     self.age = age   def
__repr__(self):     return("The tree is {} years old".format(self.age))`

`>>> tree = Tree(12) >>> print(tree) The tree is 12 years old`

There are many more built-in methods that are useful in helping keep a
program clean and organized.

For more info on built-in methods and some clever tricks, check out [Dan
Bader's Blog](https://dbader.org/blog/python-dunder-methods)

The official [Python 3
Docs](https://docs.python.org/3/reference/datamodel.html) have great
(although technical writing) on what they call "special methods".
